# 拒绝测试全绿，为什么 `IMG_2340.JPG` 还是打不开？

> 一次发生在开源 PR 评审中的真实问题：文件列表说“有这张图片”，取图接口却说“不允许”。本文记录我们如何在合并前发现它，以及为什么最后留下的不是另一个文件名样例，而是一条跨接口的不变式。
>
> 项目：[dsh-dream-skin](https://github.com/RevolutionLA/dsh-dream-skin)　功能讨论：[#61](https://github.com/RevolutionLA/dsh-dream-skin/issues/61)　功能 PR：[#114](https://github.com/RevolutionLA/dsh-dream-skin/pull/114)

## 先说人话：菜单上有这道菜，厨房却拒绝做

想象一家餐厅把“今日供应”写在门口。你指着其中一道菜下单，厨房却回答：“这个不能做。”

问题不只是菜单写错了一个字，而是**门口和厨房各自维护了一份菜单**：一边认为它可以出现，另一边认为它不能被接受。两份名单没有对上。

我们在本地文件夹壁纸功能里遇到了同一件事：

- `folder-list` 负责列出文件夹里的图片；
- `folder/file` 负责把其中一张图片交给页面显示；
- `IMG_2340.JPG` 能进入列表，却会被取图接口拒绝。

如果只看接口各自的返回，它们都“按自己的规则正确工作”；把两次调用连起来，用户看到的却是空白壁纸。

**这类缺陷不属于某一个函数，而属于函数之间的契约。**

## 问题是怎么出现的

这个功能让插件从用户主动选择的本地文件夹轮换壁纸。浏览器页面不能任意读取本地目录，所以宿主提供两个入口：一个列图片，一个取图片。

为了防止目录穿越和越界读取，取图入口需要拒绝危险文件名。第一版实现里，拒绝规则中出现了这样一段字符范围：

```js
@-\^
```

在正则表达式里，这不是“`@` 和 `^` 两个字符”，而是从 `@` 到 `^` 的 ASCII 闭区间，也就是 `0x40–0x5E`。它意外包含了全部 26 个大写字母；字符类里还单独拒绝了下划线。

于是这些现实世界里再普通不过的名字都会撞上拒绝规则：

| 文件名 | 常见来源 | 第一版结果 |
|---|---|---|
| `IMG_2340.JPG` | 手机、相机 | 能列出，不能取图 |
| `dsc_0012.png` | 相机、导出工具 | 能列出，不能取图 |
| `UPPER.PNG` | 手工命名、批量导出 | 能列出，不能取图 |

危险路径测试仍然在正常工作：`../`、反斜杠、控制字符等拒绝样例没有因此失效。问题是，**合法路径这一侧没有被同一束光照到**。

## 为什么拒绝测试全绿，还是没有接住它

当时已有一整组拒绝用例，而且全部通过。它们并非没有价值：目录穿越、分隔符和危险路径都应该测。

但测试夹具里的“合法文件名”全是小写，也没有下划线。也就是说，测试同时证明了：

1. 危险名字会被拒绝；
2. 那一小组简单的合法名字可以使用。

它没有证明第 3 件事：

> **列表接口承诺的每一个名字，取图接口是否都兑现？**

这正是测试覆盖里容易忽略的不对称：**拒绝面测得再全面，也不自动证明合法面能运行。**

甚至“再补一个大写文件名、再补一个下划线文件名”也只能修复当天的盲点。以后有人修改任一接口的规则，两边仍可能再次漂移。

## 修复之后，为什么还要加一条不变式

功能作者 [@lisihao](https://github.com/lisihao) 在 PR 合并前修正了取图规则。维护评审随后补上的核心测试不是“再试几个名字”，而是把两个入口绑成一条契约：

> **列表返回的每一个名字，都必须能够取回；返回的字节数还必须与列表声明的大小一致。**

测试的关键结构如下，完整版本见 [`tests/host.folder.test.cjs`](https://github.com/RevolutionLA/dsh-dream-skin/blob/v10.26.1/tests/host.folder.test.cjs#L347-L377)：

```js
const listing = await f.list();

assert.deepEqual(
  listing.value.files.map((x) => x.name).sort(),
  [...names].sort()
);

for (const entry of listing.value.files) {
  const served = await f.file(entry.name);
  assert.equal(served.status, 200);
  assert.equal(served.body.length, entry.size);
}
```

循环前面的 `deepEqual` 不是多余动作。没有它，如果列表突然返回空数组，“每个列出的名字都能取回”就会被**空洞地满足**：循环一次都没执行，测试照样全绿。

所以一条可靠的不变式测试通常需要两半：

1. **非空与代表性**：先证明预期样本确实进入了列表；
2. **跨接口兑现**：再逐项证明下游接受上游的每一个输出。

随后，子文件夹功能又把列表与取图的路径段判断收敛到同一个 `isFolderSegment()` 规则，见 [`lib/index.js`](https://github.com/RevolutionLA/dsh-dream-skin/blob/v10.26.1/lib/index.js#L369-L372)。**共享规则减少漂移的机会，不变式测试负责在漂移真的发生时报警；两者不是二选一。**

## 我们怎么知道这条测试不是“永远绿的摆设”

我们做过一次反向破坏：把旧的大小写与下划线拒绝规则重新引入，测试按预期失败，并直接指出：

```text
is LISTED but not served — the two predicates disagree
```

恢复修复后，该测试文件重新全部通过。

这一步很重要。一个修复配上测试，只能说明“现在它是绿的”；把修复临时撤掉后测试会变红，才说明这条测试确实守着这次修复，而不是恰好路过。

## 安全边界没有为了让测试变绿而被拆掉

“合法图片都应该可用”不等于“任何路径都应该接受”。这个功能仍然只服务用户事先选择的文件夹，并且继续拒绝：

- `../`、绝对路径和反斜杠等越界形状；
- 隐藏路径段与控制字符；
- 符号链接目录和文件；
- 不在支持范围内的格式。

后续实现还逐层检查真实目录，最后一级使用 `O_NOFOLLOW` 打开；所有路径拒绝统一返回无正文 404。相关边界与实测限制记录在 [10.26.0](https://github.com/RevolutionLA/dsh-dream-skin/releases/tag/v10.26.0) 和 [10.26.1](https://github.com/RevolutionLA/dsh-dream-skin/releases/tag/v10.26.1) 的发布说明中。

正确方向不是把安全门拆掉，而是：**安全门只拦危险形状，同时不能误伤自己已经公开承诺的合法输入。**

## 这条方法可以复用到哪里

凡是“一个组件生产候选项，另一个组件消费候选项”的地方，都可能出现同类裂缝：

| 生产者 | 消费者 | 应该钉住的不变式 |
|---|---|---|
| 文件列表 API | 文件下载 API | 每个列出的对象都能按同一标识取回 |
| 权限列表 | 操作接口 | 每个显示为可执行的操作都不会被误判拒绝 |
| 数据库查询 | 批量更新 | 查询返回的每条记录都能被后续操作命中 |
| 下拉选项 | 表单提交 | 每个可选项都属于后端接受的枚举 |
| 搜索结果 | 详情页 | 每个结果标识都能打开对应详情 |

可以把它写成一条通用检查：

```text
先证明生产者确实给出了预期样本
再遍历生产者的输出，逐项交给真实消费者
最后验证的不只是“没报错”，还有消费者承诺的结果
```

如果两个组件共享同一个判断函数，再加一条跨组件契约测试；如果不能共享，这条测试就更不能省。

## 这次合并前拦截留下了什么

这次问题没有进入已发布版本，因此它不是一次“线上事故复盘”，而是一次**评审如何阻止缺陷出厂**的记录。

它留下的也不只是一个正则修复：

- 功能作者修好了真实问题；
- 评审把偶然发现的问题变成了永久契约；
- 测试先证明样本没有悄悄消失，再证明每个承诺都能兑现；
- 反向破坏证明这条测试确实会失败；
- 后续子目录功能继续复用同一规则，并保留这条不变式。

对我们最重要的一条经验是：

> **测试数量衡量的是写了多少检查，不变式衡量的是哪些事情从此不允许再发生。两者有关，但不是一回事。**

---

## English summary

**Every rejection test passed, yet `IMG_2340.JPG` could be listed but not served.** Two independently written path predicates disagreed: the file route accidentally rejected uppercase letters and underscores, while every “valid” fixture used simple lowercase names. The contributor fixed the predicate before merge; maintainer review then added a cross-route invariant: every listed name must be served, with the advertised byte length. A separate fixture assertion prevents an empty listing from satisfying the test vacuously, and a mutation check proved that reintroducing the old predicate makes the test fail. Shared validation rules reduce drift; a consumer-facing invariant catches the drift that remains.

*案例对应 [PR #114](https://github.com/RevolutionLA/dsh-dream-skin/pull/114) 及 v10.26.0/v10.26.1。感谢 @lisihao 的功能实现与合并前修复。*
