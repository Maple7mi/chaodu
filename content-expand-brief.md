# 朝读内容扩充任务（Batch Brief）

目标：把专题库从 112 个扩到约 500 个（每个专题 6 个文章变体，合计约 3000 篇）。
本文件是每一批内容代理的共同规范。只写分配给你的文件，不要改动 `data/library` 里已有的其他文件。

## 0. 先读

1. `D:\DsProjects\science-daily\content-schema.md`（字段、长度、结构）
2. `D:\DsProjects\science-daily\content-story-guide.md`（故事化开头写法）
3. 浏览 `D:\DsProjects\science-daily\data\library\*.json` 的 `title`，避免与已有专题重复。

## 1. 输出

- 只写一个文件：路径由任务指定，例如 `data\library\expand-w1-cn-history.json`。
- 顶层：`{"version":1,"dossiers":[...]}`。
- 分配的专题数量必须**恰好**等于任务要求；不要多写、少写。
- 每个 dossier 的 `story` 直接写在 dossier 内（不要另写 story 文件）。
- id 使用任务给的前缀，全部小写 kebab-case；标题 5–30 个汉字，**全局不重复**。

## 2. 每篇 dossier 的最低结构

- `category`: `history` / `myth` / `geography` / `psychology`
- `region`: `cn` / `world`；心理学固定 `global`
- `title`: 5–30 汉字，专题名，不是文章标题
- `subtitle`: 10–70 汉字，一句话点题
- `tags`: 3–6 个中文标签
- `difficulty`: `"high-school"`
- `story`: `{hook, setup, question}`，长度按 guide：
  - hook 35–65 汉字（硬容差 30–75）
  - setup 100–150（硬容差 90–165）
  - question 20–40（硬容差 15–50）
  - 总长 180–240（硬容差 160–270）
  - setup 第一句接住 hook；先画面/人物身份，再事实；不默认读者知道前情
- `facts`: 10–12 条，每条 `{id,text}`；`text` 65–95 个汉字（硬容差 50–180），自足、可独立成段；同篇 fact id 不重复
- `angles`: 恰好 3 个；每个：
  - `id`、`title` 5–32 汉字、`altTitle`、`thesis` 18–90 汉字
  - `openings` 恰好 2 条、`closings` 恰好 2 条（各 45–110 汉字，质量优先）
  - `picks` 恰好 6 个 fact id；`altPicks` 1–2 个额外 fact id；引用的 fact 必须存在
  - `misconception` 30–110 汉字：点出一个常见误解，再纠正
- `terms`: 3–5 个 `{term,def}`；`def` 20–80 汉字
- `sources`: 2–4 条可核查的来源（作者/书名/出版社/年份，或机构报告）；不要编 URL

三个 angle 必须真的从不同问题切入，不能只是同一篇换标题。每个 angle 的 `picks` 尽量选不同的 6 条 fact，允许少量重合。

## 3. 写作口径

- 高中毕业难度；具体、可读，不写教科书式空话。
- 历史：区分史实、制度推断与后世传说；不确定的地方用“可能/学界多认为”，不要编造精确数字或对话。
- 神话：先讲文本来源（《山海经》《吉尔伽美什》、吠陀、史诗等），再讲故事；区分“文本里的版本”和“后世改编”。
- 地理：机制优先（气候、板块、水文、地貌），不要只报地名和最高/最大。
- 心理：讲相关不等于因果；避免性别本质主义；不写搭讪术、操控术；关系建议要落到边界、沟通、互惠。
- 故事 hook 不出现未解释的人名/地名/制度名；不要“众所周知”“历史长河中”“注意看这个男人叫小帅”。

## 4. 自检（必须做）

写完后运行：

```powershell
node scripts\validate-library.mjs <你的文件>
```

必须做到 **0 errors / 0 warnings**。有 warning 也要修：facts 尽量 65–95 字，story 尽量落在建议区间。再检查：

- 专题数量准确；
- id 不以数字开头，且不与其他专题重复；
- 所有 `picks`/`altPicks` 引用的 fact 存在；
- 三个 angle 的标题、论点不重复；
- 标题不与已有专题重复。

## 5. 返回

只返回简短结果：文件路径、专题数、validator 输出（错误/提醒数）、最满意的 2 个标题。不要贴全文。
