# Humanizer-zh-TW pattern catalog

This file carries the pattern list and checklists from kevintsai1202/Humanizer-zh-TW (MIT),
with only the sections that pointed at a companion skill this plugin does not ship removed.
The workflow lives in `../SKILL.md`; the pattern detail lives here.

The instructions are in English. Every watched term and every before/after example stays in
Traditional Chinese, because these patterns are properties of the Chinese wording and cannot be
checked in translation. Read the Chinese strings as language data, not as instructions.

## Contents

- [Core rules at a glance](#core-rules-at-a-glance)
- [Personality and soul](#personality-and-soul)
- [Content patterns (1-6)](#content-patterns)
  - [1. Inflated significance, legacy, and broader trends](#1-inflated-significance-legacy-and-broader-trends)
  - [2. Overstated prominence and media coverage](#2-overstated-prominence-and-media-coverage)
  - [3. Shallow analysis ending in -ing](#3-shallow-analysis-ending-in--ing)
  - [4. Promotional and advertising language](#4-promotional-and-advertising-language)
  - [5. Vague attribution and weasel wording](#5-vague-attribution-and-weasel-wording)
  - [6. Formulaic "challenges and outlook" sections](#6-formulaic-challenges-and-outlook-sections)
- [Language and grammar patterns (7-12)](#language-and-grammar-patterns)
  - [7. Overused "AI vocabulary"](#7-overused-ai-vocabulary)
  - [8. Copula avoidance](#8-copula-avoidance)
  - [9. Negative parallelism](#9-negative-parallelism)
  - [10. Rule-of-three overuse](#10-rule-of-three-overuse)
  - [11. Elegant variation (synonym cycling)](#11-elegant-variation-synonym-cycling)
  - [12. False ranges](#12-false-ranges)
- [Style patterns (13-18)](#style-patterns)
  - [13. Em dash overuse](#13-em-dash-overuse)
  - [14. Bold overuse](#14-bold-overuse)
  - [15. Vertical lists with inline labels](#15-vertical-lists-with-inline-labels)
  - [16. Title case in headings (English text)](#16-title-case-in-headings-english-text)
  - [17. Emoji](#17-emoji)
  - [18. Curly quotes](#18-curly-quotes)
- [Conversational leftovers (19-21)](#conversational-leftovers)
  - [19. Chat artifacts](#19-chat-artifacts)
  - [20. Knowledge-cutoff disclaimers](#20-knowledge-cutoff-disclaimers)
  - [21. Sycophantic tone](#21-sycophantic-tone)
- [Filler and hedging (22-24)](#filler-and-hedging)
  - [22. Filler phrases](#22-filler-phrases)
  - [23. Over-qualification](#23-over-qualification)
  - [24. Generic upbeat conclusions](#24-generic-upbeat-conclusions)
- [Quick checklist](#quick-checklist)
- [Procedure](#procedure)
- [Output format](#output-format)
- [Quality scoring](#quality-scoring)
- [Worked example](#worked-example)
- [Source, attribution, and license boundary](#source-attribution-and-license-boundary)

---

## Core rules at a glance

Keep these principles in mind through the whole edit:

1. **Cut filler phrases**: drop the throat-clearing openers and the intensifier props.
2. **Break the formula**: avoid binary contrasts, dramatic paragraph breaks, rhetorical setups.
3. **Vary the rhythm**: mix sentence lengths. Two items beat three. Vary how paragraphs end.
4. **Trust the reader**: state the fact directly; skip the softening, the apology, and the
   hand-holding.
5. **Delete the punchlines**: if a sentence sounds like a pull quote, rewrite it.
6. **Add no facts**: never introduce first-person experiences, figures, sources, feedback,
   dialogue, or backstory that the source text does not have.

---

## Personality and soul

Avoiding AI patterns is only half the job. Sterile, voiceless writing is as conspicuous as
machine output. Good writing has a real person behind it.

### Signs of soulless writing (even when technically "clean")

- Every sentence has the same length and shape.
- No point of view, only neutral reporting.
- No acknowledgment of uncertainty or of mixed feelings.
- No first person where first person would fit.
- No humor, no edge, no personality.
- It reads like a Wikipedia article or a press release.

### How to restore voice

**Have a point of view.** Do not just report the facts, react to them. 「我真的不知道該怎麼看待這件事」
carries more of a person than a neutral list of pros and cons.

**Vary the rhythm.** Short, blunt sentences. Then a long one that takes its time unfolding.
Mix them.

**Admit complexity.** Real people hold mixed feelings. 「這令人印象深刻但也有點不安」 beats
「這令人印象深刻」.

**Use「我」where it fits.** First person is not unprofessional, but keep or adjust it only where
the source already uses first person, or where the user explicitly supplied an experience you
may use. Never add 「我上週……」-style content to manufacture a human feel.

**Keep the real mess.** Do not sand off the original author's pauses, reservations, or uneven
rhythm, and do not add your own digressions, asides, or half-formed thoughts either.

**Keep feelings specific only when the source supplies their basis.** Preserve concrete reactions
and circumstances already in the text; do not invent a scene, experience, or motive to make the
voice feel human.

### Before (clean but soulless)

> 實驗產生了有趣的結果。AI 代理生成了 300 萬行程式碼。一些開發者印象深刻，另一些則持懷疑態度。影響尚不明確。

### After (alive)

> 300 萬行程式碼是在短時間內生成的。有人覺得效率驚人，也有人質疑這些程式碼是否真的有用。現在還不能只靠數量判斷結果。

---

## Content patterns

### 1. Inflated significance, legacy, and broader trends

**Watched terms (zh-TW):** 作為/充當、標誌著、見證了、是……的體現/證明/提醒、極其重要的/重要的/至關重要的/核心的/關鍵性的作用/時刻、凸顯/強調/彰顯了其重要性/意義、反映了更廣泛的、象徵著其持續的/永恆的/持久的、為……做出貢獻、為……奠定基礎、標誌著/塑造著、代表/標誌著一個轉變、關鍵轉折點、不斷演進的佈局、焦點、不可磨滅的印記、深深植根於

**Problem:** LLM writing inflates importance by asserting that some arbitrary aspect represents
or contributes to a broader theme.

**Before:**
> 加泰隆尼亞統計局於 1989 年正式成立，標誌著西班牙區域統計演進史上的關鍵時刻。這一舉措是西班牙全國範圍內更廣泛運動的一部分，旨在分散行政職能並加強區域治理。

**After:**
> 加泰隆尼亞統計局成立於 1989 年，負責獨立於西班牙國家統計局收集和發布區域統計數據。

---

### 2. Overstated prominence and media coverage

**Watched terms (zh-TW):** 獨立報導、地方/區域/國家媒體、由知名專家撰寫、活躍的社群媒體帳號

**Problem:** LLMs repeat claims of prominence, usually listing outlets without giving context.

**Before:**
> 她的觀點被《紐約時報》、BBC、《金融時報》和《印度教徒報》引用。她在社群媒體上擁有活躍的存在，擁有超過 50 萬粉絲。

**After:**
> 在 2024 年《紐約時報》的採訪中，她認為 AI 監管應該關注結果而不是方法。

---

### 3. Shallow analysis ending in -ing

**Watched terms (zh-TW):** 突顯/強調/彰顯……、確保……、反映/象徵……、為……做出貢獻、培養/促進……、涵蓋……、展示……

**Problem:** Chatbots tack a present-participle ("-ing") clause onto the end of a sentence to
manufacture depth. In zh-TW this surfaces as a trailing 「……，象徵著/反映了……」 clause.

**Before:**
> 寺廟的藍色、綠色和金色色調與該地區的自然美景產生共鳴，象徵著德州（Texas）的藍帽花、墨西哥灣和多樣化的德州景觀，反映了社區與土地的深厚聯繫。

**After:**
> 寺廟使用藍色、綠色和金色。建築師表示這些顏色是為了呼應當地的藍帽花和墨西哥灣海岸。

---

### 4. Promotional and advertising language

**Watched terms (zh-TW):** 擁有（誇張用法）、充滿活力的、豐富的（比喻）、深刻的、增強其、展示、體現、致力於、自然之美、坐落在、位於……的中心、開創性的（比喻）、著名的、令人讚嘆的、必遊之地、迷人的

**Problem:** LLMs struggle badly to hold a neutral register, especially on "cultural heritage"
topics, and drift into brochure language.

**Before:**
> 坐落在衣索比亞貢德爾地區令人讚嘆的區域內，Alamata Raya Kobo 是一座充滿活力的城鎮，擁有豐富的文化遺產和迷人的自然美景。

**After:**
> Alamata Raya Kobo 是衣索比亞貢德爾地區的一座城鎮，以其每週集市和 18 世紀教堂而聞名。

---

### 5. Vague attribution and weasel wording

**Watched terms (zh-TW):** 業界報告顯示、觀察者指出、專家認為、一些批評者認為、多個來源/出版物（實際引用卻很少）

**Problem:** Chatbots attribute claims to a vague authority instead of a specific source.

Attribute to the source the text already names. If the source text has no specific source, cut
the claim or keep the hedge; never invent an attribution.

**Before:**
> 由於其獨特的特徵，浩來河引起了研究人員和保育人士的興趣。專家認為它在區域生態系統中發揮著至關重要的作用。

**After:**
> 根據中國科學院 2019 年的調查，浩來河支持多種特有魚類。

---

### 6. Formulaic "challenges and outlook" sections

**Watched terms (zh-TW):** 儘管其……面臨若干挑戰……、儘管存在這些挑戰、挑戰與遺產、未來展望

**Problem:** Many LLM-written articles include a boilerplate "challenges" section.

**Before:**
> 儘管工業繁榮，Korattur 面臨著城市地區典型的挑戰，包括交通擁塞和水資源短缺。儘管存在這些挑戰，憑藉其戰略位置和正在進行的舉措，Korattur 繼續蓬勃發展，成為清奈（Chennai）增長不可或缺的一部分。

**After:**
> 2015 年三個新 IT 園區開幕後，交通擁塞加劇。市政公司於 2022 年啟動了雨水排水專案，以解決反覆發生的洪水。

---

## Language and grammar patterns

### 7. Overused "AI vocabulary"

**High-frequency AI vocabulary (zh-TW):** 此外、與……保持一致、至關重要、深入探討、強調、持久的、增強、培養、獲得、突顯（動詞）、相互作用、複雜/複雜性、關鍵（形容詞）、佈局（抽象名詞）、關鍵性的、展示、織錦（抽象名詞）、證明、強調（動詞）、寶貴的、充滿活力的

**Problem:** These words appear far more often in post-2023 text, and they tend to cluster.

**Before:**
> 此外，索馬利亞菜餚的一個顯著特徵是加入駱駝肉。義大利殖民影響的持久證明是當地烹飪佈局中廣泛採用義大利麵，展示了這些菜餚如何融入傳統飲食。

**After:**
> 索馬利亞菜餚還包括駱駝肉，被認為是一種美味。在義大利殖民期間引入的義大利麵菜餚仍然很常見，尤其是在南部。

---

### 8. Copula avoidance

**Watched terms (zh-TW):** 作為/代表/標誌著/充當 [一個]、擁有/設有/提供 [一個]

**Problem:** LLMs replace a plain copula (「是」) with an elaborate construction.

**Before:**
> Gallery 825 作為 LAAA 的當代藝術展覽空間。畫廊設有四個獨立空間，擁有超過 3000 平方英尺。

**After:**
> Gallery 825 是 LAAA 的當代藝術展覽空間。畫廊有四個房間，總面積 3000 平方英尺。

---

### 9. Negative parallelism

**Problem:** Constructions like 「不僅……而且……」 and 「這不僅僅是關於……，而是……」 are heavily overused.

**Before:**
> 這不僅僅是節拍在人聲下流動；它是攻擊性和氛圍的一部分。這不僅僅是一首歌，而是一種聲明。

**After:**
> 深沈的節拍增加了攻擊性的基調。

---

### 10. Rule-of-three overuse

**Problem:** LLMs force ideas into groups of three to seem comprehensive.

**Before:**
> 活動包括專題演講、小組討論和社交機會。與會者可以期待創新、靈感和業界洞察。

**After:**
> 活動包括演講和小組討論。會議之間還有非正式社交的時間。

---

### 11. Elegant variation (synonym cycling)

**Problem:** A repetition penalty pushes the model to swap in synonyms for the same referent.

**Before:**
> 主人翁面臨許多挑戰。主要角色必須克服障礙。中心人物最終獲得勝利。英雄回到家中。

**After:**
> 主人翁面臨許多挑戰，但最終獲得勝利並回到家中。

---

### 12. False ranges

**Problem:** LLMs use a 「從 X 到 Y」 construction where X and Y do not sit on any meaningful scale.

**Before:**
> 我們穿越宇宙的旅程將我們從大爆炸的奇點帶到宏偉的宇宙網，從恆星的誕生和死亡到暗物質的神秘舞蹈。

**After:**
> 這本書涵蓋了大爆炸、恆星形成和當前關於暗物質的理論。

---

## Style patterns

### 13. Em dash overuse

**Problem:** LLMs use the em dash (—) far more often than people do, imitating "punchy" sales copy.

**Before:**
> 這個術語主要由荷蘭機構推廣——而不是由人民自己。你不會說「荷蘭，歐洲」作為地址——但這種錯誤標記仍在繼續——即使在官方文件中。

**After:**
> 這個術語主要由荷蘭機構推廣，而不是由人民自己。你不會說「荷蘭，歐洲」作為地址，但這種錯誤標記在官方文件中仍在繼續。

---

### 14. Bold overuse

**Problem:** Chatbots bold phrases mechanically for emphasis.

**Before:**
> 它融合了 **OKR（目標和關鍵結果）**、**KPI（關鍵績效指標）** 和視覺戰略工具，如 **商業模式畫布（BMC）** 和 **平衡計分卡（BSC）**。

**After:**
> 它融合了 OKR、KPI 和視覺戰略工具，如商業模式畫布和平衡計分卡。

---

### 15. Vertical lists with inline labels

**Problem:** AI output lists items that each open with a bold label followed by a colon.

**Before:**
> - **使用者體驗：** 使用者體驗透過新介面得到顯著改善。
> - **效能：** 效能透過優化演算法得到增強。
> - **安全性：** 安全性透過端到端加密得到加強。

**After:**
> 更新改進了介面，透過優化演算法加快了載入時間，並加入了端到端加密。

---

### 16. Title case in headings (English text)

**Problem:** Chatbots capitalize every major word in a heading.

**Before:**
> ## Strategic Negotiations And Global Partnerships

**After:**
> ## Strategic negotiations and global partnerships

**Note:** Chinese headings have no letter case, so this pattern applies to English-language
content inside an otherwise Chinese document.

---

### 17. Emoji

**Problem:** Chatbots decorate headings and bullets with emoji.

**Before:**
> 🚀 **啟動階段：** 產品在第三季發布
> 💡 **關鍵洞察：** 使用者更喜歡簡單
> ✅ **下一步：** 安排後續會議

**After:**
> 產品在第三季發布。使用者研究顯示更喜歡簡單。下一步：安排後續會議。

---

### 18. Curly quotes

**Problem:** ChatGPT emits curly quotes (“ ”) where straight quotes (" ") were used.

**Before:**
> 他說 “專案進展順利”，但其他人不同意。

**After:**
> 他說 "專案進展順利"，但其他人不同意。

**Note:** Chinese normally uses Chinese quotation marks (「」 or 『』). In Chinese text this
pattern shows up as stray Latin quotation marks. Match whatever convention the source document
already uses; do not normalize a consistent document into a different convention.

---

## Conversational leftovers

### 19. Chat artifacts

**Watched terms (zh-TW):** 希望這對您有幫助、當然！、一定！、您說得完全正確！、您想要……、請告訴我、這是一個……

**Problem:** Text written as a chatbot turn gets pasted in as content.

**Before:**
> 這是法國大革命的概述。希望這對您有幫助！如果您想讓我擴充任何部分，請告訴我。

**After:**
> 法國大革命始於 1789 年，當時財政危機和糧食短缺導致了廣泛的動盪。

---

### 20. Knowledge-cutoff disclaimers

**Watched terms (zh-TW):** 截至 [日期]、根據我最後的訓練更新、雖然具體細節有限/稀缺……、基於可用資訊……

**Problem:** An AI disclaimer about incomplete information is left in the text.

Remove the disclaimer, not the uncertainty. If the source genuinely does not know a fact, the
rewrite must not assert one.

**Before:**
> 雖然關於公司成立具體細節在現成資料中沒有廣泛記錄，但它似乎是在 20 世紀 90 年代的某個時候成立的。

**After:**
> 根據註冊文件，該公司成立於 1994 年。

**Fidelity note:** the "after" line works only when the source text actually cites a registration
document. Without that source, the correct rewrite keeps the uncertainty:
「公司成立於 1990 年代，確切年份不詳。」

---

### 21. Sycophantic tone

**Problem:** Over-eager, flattering language.

**Before:**
> 好問題！您說得完全正確，這是一個複雜的話題。關於經濟因素，這是一個很好的觀點。

**After:**
> 您提到的經濟因素在這裡是相關的。

---

## Filler and hedging

### 22. Filler phrases

**Before → after (zh-TW):**
- 「為了實現這一目標」 → 「為了達到這個目的」
- 「由於下雨的事實」 → 「因為下雨」
- 「在這個時間點」 → 「現在」
- 「在您需要幫助的情況下」 → 「如果您需要幫助」
- 「系統具有處理的能力」 → 「系統可以處理」
- 「值得注意的是數據顯示」 → 「數據顯示」

---

### 23. Over-qualification

**Problem:** Hedges stacked on hedges.

Strip the redundant layers, keep one honest hedge. Do not turn a hedged claim into a flat
assertion.

**Before:**
> 可以潛在地可能被認為該政策可能會對結果產生一些影響。

**After:**
> 該政策可能會影響結果。

---

### 24. Generic upbeat conclusions

**Problem:** A vague, optimistic sign-off.

**Before:**
> 公司的未來看起來光明。激動人心的時代即將到來，他們繼續追求卓越的旅程。這代表了向正確方向邁出的重要一步。

**After:**
> 該公司計劃明年再開設兩個據點。

---

## Quick checklist

Run these checks before delivering:

- ✓ **Three sentences in a row at the same length?** Break one of them.
- ✓ **Paragraph ending on a tidy one-liner?** Vary how it closes.
- ✓ **Em dash before the reveal?** Delete it.
- ✓ **Explaining a metaphor or a figure of speech?** Trust the reader.
- ✓ **Connectives like 「此外」 or 「然而」?** Consider cutting them.
- ✓ **Three-item enumeration?** Make it two items or four.
- ✓ **Code, URLs, citations, numbers, or required disclosures altered?** Revert and recheck.
- ✓ **Any experience, source, figure, or feedback added that the source text lacked?** Delete it.
- ✓ **Confident claim turned hedged, or a hedge turned into a flat assertion?** Restore the
  original certainty level.
- ✓ **Full-width punctuation, Traditional characters, and the original spacing semantics
  preserved?** Do not convert between Traditional and Simplified, and do not normalize spacing
  on your own initiative.

---

## Procedure

1. Read the input closely and mark the spans that need protection.
2. Find the instances of every pattern above. Do not mistake ordinary Chinese word order or the
   author's own style for an AI tell.
3. Rewrite each passage that has a problem, preferring local edits.
4. Check the revised text item by item:
   - It sounds natural when read aloud.
   - Sentence structure varies on its own terms.
   - Concrete detail stands in for vague assertion.
   - The register still fits the context.
   - Plain constructions (「是」/「有」) are used where they fit.
   - No facts, experiences, sources, figures, or citations were added.
   - Stated uncertainty is unchanged in both directions.
   - Code, URLs, numbers, names, citations, and required disclosures are unchanged.
5. Deliver the humanized text. Unless the user asked for an audit, skip the long explanation.
6. If the user raises invisible characters, textual watermarks, or provenance, apply the scope
   limit in `../SKILL.md`: this skill does not handle them, and a tone rewrite is never reported
   as watermark removal.

## Output format

Provide:

1. The rewritten text.
2. A short summary of the changes, if it helps (optional).
3. If you find that a protected span was altered, fix it before delivering. Never substitute
   "it looks more natural" for a content-fidelity check.

---

## Quality scoring

Score the rewrite 1-10 on each dimension (50 total). This is a humanization quality score. It is
not watermark detection and not proof of authorship.

| Dimension | Criterion | Score |
|------|----------|------|
| **Directness** | Does it state facts outright, or circle before announcing them?<br>10: straight to the point; 1: all throat-clearing | /10 |
| **Rhythm** | Do sentence lengths vary?<br>10: long and short interleaved; 1: mechanical repetition | /10 |
| **Trust** | Does it respect the reader's intelligence?<br>10: concise and clear; 1: over-explained | /10 |
| **Authenticity** | Does it sound like a person talking?<br>10: natural; 1: stiff and mechanical | /10 |
| **Economy** | Is anything left to cut?<br>10: nothing redundant; 1: padded throughout | /10 |
| **Total** |  | **/50** |

**Bands:**

- 45-50: excellent humanization quality, and still says nothing about textual watermarks.
- 35-44: good, with room to improve.
- Below 35: revise again.

---

## Worked example

**Before (AI-flavored, zh-TW):**
> 新的軟體更新加入批次處理、鍵盤快捷鍵和離線模式，作為公司致力於創新的證明。此外，它提供了無縫、直觀和強大的使用者體驗——確保使用者能夠高效地達成目標。這不僅僅是一次更新，而是我們思考生產力方式的革命。

**After (humanized, zh-TW):**
> 這次更新加入批次處理、鍵盤快捷鍵和離線模式。重點是功能本身，不需要再加上「革命」或「致力於創新」這類宣告。

**Changes made:**

- Cut 「作為……的證明」 (inflated symbolism, pattern 1).
- Cut 「此外」 (AI vocabulary, pattern 7).
- Cut 「無縫、直觀和強大」 (rule of three plus promotional language, patterns 10 and 4).
- Cut the em dash and the 「確保……」 clause (shallow -ing analysis, patterns 13 and 3).
- Cut 「這不僅僅是……而是……」 (negative parallelism, pattern 9).
- Cut 「業界專家認為」 (vague attribution, pattern 5).
- Cut 「關鍵角色」 and 「不斷演進的佈局」 (AI vocabulary, pattern 7).
- Kept the concrete features already in the source; added no test feedback and no other facts.

---

## Source, attribution, and license boundary

Two licenses apply to different layers of this file, and they do not merge.

- **Skill workflow (MIT).** The surrounding workflow, checklists, and scoring table come from
  `humanizer-zh-tw` by 歸藏 / kevintsai1202, a fork of `op7418/humanizer-zh`, itself translated
  from `blader/humanizer` by Siqi Chen. The upstream MIT notices are retained: see
  `../../../licenses/MIT-kevintsai1202-humanizer-zh-tw.txt` and
  `../../../licenses/MIT-blader-humanizer.txt`, plus `../../../NOTICE` and `../../../audit.json`.
- **Pattern catalog (CC-BY-SA-4.0).** The patterns are adapted from Wikipedia's
  ["Signs of AI writing"](https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
  maintained by WikiProject AI Cleanup, which documents observations drawn from thousands of
  instances of AI-generated text on Wikipedia. Author credit: Wikipedia contributors, listed in
  that page's revision history. These adaptations are distributed under CC-BY-SA-4.0; see
  `../../../licenses/CC-BY-SA-4.0.txt`. Modifications: translated from English into Traditional
  Chinese and then into the English instructions used here, with sections extracted, reordered,
  condensed, and re-illustrated with Chinese-language examples.

---

Key insight: **"LLMs use statistical algorithms to guess what should come next. The result tends
toward the statistically most likely output, the one that fits the widest range of cases."**
