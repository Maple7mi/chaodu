# 朝读全库事实核查协议

## 任务

对一个 batch 内每个 dossier 的**每一条 fact**做事实核查。目标不是润色，而是判断它作为科普陈述是否站得住，并在有可靠证据时给出可直接替换的修正文本。

- facts 是 60–95 字的短段落，一条里可能包含多个原子断言；逐个断言看。
- `sources` 是书目/机构/文献名字符串，不一定有 URL。它们只说明作者参考过什么，**不自动等于该 fact 已被来源支持**。
- 不靠模型记忆下结论。关键事实必须 `web_search`，必要时 `web_fetch` 打开原文。
- 来源必须可追溯：机构/作者、标题、URL、支持该句的原文位置。摘录要短。
- 中文题可查中文来源；世界史/地理/心理尽量中英并行。对可能有争议的结论，做一次反向搜索（“X 是错的吗 / 争议 / 不同研究”）。
- 不要编造 URL、书名、引文或页码。打不开就写 `unverifiable`，不要用“可能”“大概”补成肯定句。

## 每条 fact 的判定

`verdict` 只能取：

- `supported`：能给出至少一个可靠来源，且没有发现反证；关键断言（年份、数字、专名、研究结论）最好两个独立来源。
- `imprecise`：方向对，但数字/范围/因果强度/归属不准确，需要改一两个词或补限定。
- `wrong`：与可靠来源矛盾，必须改。
- `unsupported`：找不到可靠来源支持；不能证明它错，但不能当已核实。
- `unverifiable`：关键来源打不开、付费墙、仅存在于不可检索材料，无法判断。

高风险断言（年份、数字、专名、“最早/唯一/最大/第一次”、具体研究/作者/年份、医疗或心理因果）没有来源时不能给 `supported`。

## 输出

写入 `D:\DsProjects\science-daily\data\factcheck\parts\batch-XX.json`（与输入 batch 编号一致），UTF-8 JSON：

```json
{
  "batch": "batch-01",
  "checkedAt": "2026-11-18T02:30:00+08:00",
  "dossiers": [
    {
      "id": "cn-geo-qinling",
      "status": "verified",
      "confidence": "high",
      "facts": [
        {"id": "f1", "verdict": "supported", "confidence": "high"},
        {"id": "f2", "verdict": "imprecise", "confidence": "medium", "issue": "issue-01"}
      ],
      "issues": [
        {
          "id": "issue-01",
          "factId": "f2",
          "severity": "minor",
          "verdict": "imprecise",
          "claim": "原句中最值得怀疑的那一句",
          "problem": "哪里不对/缺什么限定",
          "correction": "可直接替换整条 fact 的新文本；不需要改就写 null",
          "evidence": [
            {"title": "来源标题", "url": "https://...", "quote": "支持判断的短引文"}
          ]
        }
      ],
      "sourceNotes": ["书目里缺出版社/年份，或该来源其实不支持这条 fact"],
      "summary": "一句话说明本专题核查结论"
    }
  ]
}
```

规则：

1. `facts` 必须覆盖 batch 里该 dossier 的**全部 fact id**，一条不漏；这是审计账本。
2. `issues` 只放非 `supported` 的条目；`supported` 不写 issue。
3. `correction` 优先给**完整替换文本**，保持原长度 60–95 汉字、高中毕业难度、不引入新专名；没有把握就写 `null`，不要瞎改。
4. `status` 由你按整体判断：`verified`（全部 supported）、`corrected`（有 wrong/imprecise 且给出 correction）、`disputed`（可靠来源互相矛盾）、`unverifiable`（关键断言无法取证）。不要为了好看全写 verified。
5. 证据 URL 必须是你实际打开或搜索结果中出现的；不能写 `example.com`。
6. 只写这个 part 文件，不改 `data/library`、不改 issue、不 commit。
7. 完成后在对话里只回：batch 编号、专题数、fact 数、各 verdict 数量、issue 数、写入路径。不要把整个 JSON 贴回。

## 取舍

- 先处理高风险：年份/数字/专名/“首次/唯一/最”、研究作者与年份、因果句、医学/心理断言。
- 描述性、常识性句子也要有 verdict；可以用一个权威综述/官方页面支撑一组相邻断言，但不要用同一个泛泛首页支撑整篇。
- 如果一条 fact 的多个断言里只有一个错，`verdict` 取最严重的；`problem` 指明是哪一个。
- 不要把“来源是书、网上找不到全文”直接判 `unverifiable`：先用书名+作者+关键词搜书评/图书馆/论文引用/作者访谈；仍找不到再标。
- 不要修改标题、story、angles；本任务只审 facts。标题明显事实错误时写进 `sourceNotes`，不要自行改。
