# 朝读 · DAILY SCIENCE

每天早起，读二十篇。历史、神话、地理，加上五篇关于亲密关系的心理学；每篇约六百字，高中毕业难度。

网站只在本机运行：`http://127.0.0.1:4321`。没有账号、没有云端、没有 npm 依赖，内容与阅读记录都在 `data\` 下。

## 每天会发生什么

- **08:00**：计划任务唤醒电脑，生成当天的 20 篇，并往 Windows 托盘推一条「朝读 · 20 篇新科普」。点推送直接打开今日页。
- **当天完成**：08:00 的推送只提示打卡，20 篇都给出 1–5 星评分后，才补发一条「今日完成 20/20」。打开文章或点「我知道」不算完成。
- **08:00 前**：今日页显示倒计时；仍可回看往期与「已读」。
- **配比**：历史 6、神话 4、地理 5、心理 5。历史 / 神话 / 地理这 15 篇里，中国 : 世界按两日平均 3 : 7（单日 4 : 11 或 5 : 10 交替）；心理 5 篇单独计。
- **难度**：高中毕业可读；每篇正文 560–680 个汉字，约 3 分钟。专有名词在文末「小词条」，来源在「延伸与来源」。
- **讲法**：每篇先用一个画面或问题开场，交代时间、地点、局面和人物身份，再进入事实；第一次出现的人名会带身份，不要求读者自带前情。故事化开头的写法见 `content-story-guide.md`。

## 反馈怎么影响明天

每篇底部固定一条反馈栏：

| 操作 | 含义 | 对之后编排的影响 |
| --- | --- | --- |
| 我知道，不用看 | 已了解，不需要再读 | 轻微降低同类类别/标签权重 |
| 不感兴趣 | 以后少推这类 | 明显降低该篇标签与类别的权重 |
| ★ – ★★★★★ | 1–5 星 | 3 星中性；4–5 星提高同类权重；1–2 星降低 |

- 权重按 **90 天半衰期** 衰减，类别与标签分别累计，再用于之后每天的选材与变体选择。
- 反馈只影响**未来**的编排，不改写已经生成的今日列表。
- **只有 1–5 星评分会自动跳下一篇**；点「我知道」或「不感兴趣」只记录偏好，留在本页，并提示这个不算今日完成。
- 键盘：`1`–`5` 评分、`k` 我知道、`d` 不感兴趣、`n` 下一篇、`Esc` 返回。

## 每天怎样算完成

打开文章不算完成，**20 篇各拿到一个 1–5 星评分才算**。

- 「我知道」「不感兴趣」不计入 20 个评分，也不会让顶部进度增加。
- 今日页顶部、进度环和页脚都显示 `已评 x/20`；未满时提示还差几个评分。
- 20 个评分打满后，今日页显示完成；当天 08:00 的第一次推送只提示“完成 20 个评分后打卡”，满 20 后才补发一条「今日完成 20/20」。
- 评分可以修改；同一篇改评只算一次。把评分改成「我知道」会重新变成未完成。

## 已读

打开文章即计入「已读」，不要求先评分。已读栏支持：

- 按标题 / 摘要 / 标签搜索；
- 按历史、神话、地理、心理筛选；
- 按评过分、我知道、不感兴趣、未反馈筛选；
- 按最近阅读倒序分页，点进去可重读。

「口味」页展示累计已读、连续天数、评分分布、最近 14 天、常读类别/标签，以及当前推送权重。

## 启动

要求 Node.js 20 或更新版本（开发环境为 Node 26）。不需要 `npm install`。

```powershell
cd D:\DsProjects\science-daily
node server.js
```

或双击 `start.bat`（启动服务并打开浏览器）。

打开 <http://127.0.0.1:4321>。

> 08:00 前首次打开只会看到锁页；生成当天内容可手动执行：
>
> ```powershell
> node scripts\generate.mjs --force
> ```

## GitHub

代码与内容库公开在 <https://github.com/Maple7mi/chaodu>。

仓库只提交代码、内容库和文档；以下本机数据不会上传：

- `data\state.json`（已读、反馈、口味）
- `data\issues\`（每天生成的文章）
- `data\push\`（推送标记）
- `data\backups\`（备份）

`.gitignore` 已处理这些路径，克隆仓库后运行 `node server.js` 即可得到一个没有阅读记录的干净站点。

## 安装每天 08:00 的推送

在**当前用户**的 PowerShell 里运行（无需管理员）：

```powershell
cd D:\DsProjects\science-daily
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-task.ps1
```

会注册两个计划任务：

- `ChaoduDaily`：每天 08:00 运行 `scripts\daily.mjs`，生成内容并推送；允许唤醒电脑、错过时间后补跑。
- `ChaoduServer`：登录时通过 `scripts\run-server-hidden.vbs` 隐藏窗口启动网站，不设 15 分钟运行上限，登录后常驻。

手动触发一次：

```powershell
Start-ScheduledTask -TaskName ChaoduDaily
Get-ScheduledTaskInfo -TaskName ChaoduDaily
```

`LastTaskResult` 为 `0` 即成功。卸载：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\install-task.ps1 -Uninstall
```

推送复用工作区已有的托盘通道 `D:\DsProjects\push`；`allow.json` 已加入 `science`。托盘程序不在时，条目会留在 `D:\DsProjects\push\inbox`，下次启动会汇总显示。推送按日期去重，同一天重复触发不会重复弹窗。

## 内容库

`data\library\*.json` 是专题库。每个专题包含：

- 10–12 条 `facts`（每条 65–95 汉字，自足、可独立成段）；
- 3 个 `angles`（切入角度），每个角度 2 个 openings / 2 个 closings、6 个 picks、2 个 altPicks；
- `terms`、`sources`、`misconception`。

每个角度 × 2 个 edition 会组合出 6 篇文章变体；同一天不会重复用同一变体，近期用过的会降权。

新增或修改后运行校验：

```powershell
node scripts\validate-library.mjs
node scripts\validate-library.mjs data\library\my-file.json
```

写作口径与完整字段见 [`content-schema.md`](content-schema.md)。当前库覆盖 112 个专题、672 个文章变体，足够每天 20 篇轮换一个月以上；正在扩充到约 500 个专题、3000 个变体。

## 目录

```
server.js                 HTTP 服务、API、静态文件
lib\paths.mjs             路径与常量
lib\time.mjs              时区、08:00 解锁、日期工具
lib\util.mjs              原子写、随机数、汉字计数
lib\library.mjs           专题库加载与索引
lib\composer.mjs          专题 → 文章（标题/正文/词条/来源）
lib\selection.mjs         每日 20 篇的配比、去重、加权选择
lib\issues.mjs            每日 issue 的读写
lib\store.mjs             已读、反馈、权重、统计
lib\api.mjs               API 业务层
lib\scheduler.mjs         08:00 解锁与推送调度
lib\notify.mjs            调用托盘推送
public\                   前端（原生 HTML/CSS/JS，hash 路由）
scripts\generate.mjs      生成某天内容
scripts\daily.mjs         08:00 入口：生成 + 确保服务 + 推送
scripts\install-task.ps1  安装/卸载计划任务
tests\smoke.mjs           API 与页面冒烟测试
data\library\             内容库
data\story\               故事化开头（与专题同 id）
data\issues\              每天生成的文章
data\state.json           阅读、反馈、推送状态
data\backups\             状态自动备份
```

## 测试

```powershell
node tests\smoke.mjs
```

测试使用独立的临时数据目录与 4399 端口，不会污染真实的 `data\state.json`。覆盖：健康检查、静态页 CSP、bootstrap、往期 issue、文章读取、重复阅读、1–5 星评分、20 个评分完成判定、我知道/不感兴趣不计入、已读筛选、统计、推送开关、404。

## 数据与隐私

- 只监听 `127.0.0.1`，不对外网开放。
- 阅读与反馈只写本机 `data\state.json`；每次写操作前自动备份到 `data\backups\`（保留 120 份）。
- GitHub 公开的是代码、内容库与文档，不含 `data\state.json`、`data\issues\`、`data\push\`、`data\backups\`。
- 内容生成不需要联网；推送只写本机托盘队列。
- 可随时删除 `data\issues\` 与 `data\state.json` 重新开始（会失去已读与口味记录）。
