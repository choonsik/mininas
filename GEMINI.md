# Project Harness Rules: GitHub Communication Standard

## 1. Core Principle: ASD-STE100 (Simplified Technical English)
When creating or updating GitHub-related content (git commit messages, pull request titles/descriptions, issue discussions, release notes, and documentation), you must follow the principles of **ASD-STE100 (Simplified Technical English)**.

The goal is clear, simple, and unambiguous communication.

---

## 2. Key Writing Rules

### 2.1 One Word, One Meaning
- Use each word with only one meaning and one grammatical category.
- Avoid vague or multi-meaning words.
- Prefer direct, simple words:
  - Use `use` (not `utilize` or `leverage`).
  - Use `make` (not `fabricate` or `formulate`).
  - Use `show` (not `demonstrate` or `indicate`).
  - Use `verify` or `inspect` (instead of `check` when meaning is validation).

### 2.2 Sentence Length Limits
- **Procedural / Step instructions**: Maximum 20 words per sentence.
- **Descriptive statements**: Maximum 25 words per sentence.
- Break compound or run-on sentences into shorter standalone sentences.

### 2.3 One Instruction per Sentence
- State only one action per sentence.
- Do not chain multiple actions with "and" or "then" in single steps.

### 2.4 Active Voice and Imperative Mood
- Always prefer the **active voice** over the passive voice:
  - Standard: `The server sends an authentication token.`
  - Avoid: `An authentication token is sent by the server.`
- Use the **imperative mood** (base verb) for commit titles and procedural instructions:
  - Standard: `Add cache layer to token validator`
  - Avoid: `Added cache layer...` / `Adding cache layer...`

### 2.5 Vocabulary, Tone, and Structure
- Use simple and consistent vocabulary. Avoid idioms, slang, and filler phrases.
- Do not use contractions (`do not` instead of `don't`, `cannot` instead of `can't`).
- Limit noun clusters to a maximum of 3 words (e.g., avoid "system cache memory management handler").
- Put condition clauses at the start of a sentence:
  - Standard: `If the build fails, read the error log.`
  - Avoid: `Read the error log if the build fails.`

### 2.6 Minimize Decorative Emojis (No AI Slop)
- Do not use decorative or cliché emojis (e.g., 🚀, 🌟, ✨, 📌, 💡, 🔥, ⚡, 🛡️, 🎯, 🧪, 📦) in headings, lists, or titles.
- Do not use emojis as heading prefixes or bullet markers.
- Maintain a clean, professional technical writing tone.
- Restrict emoji or symbol usage only to functional status indicators (e.g., pass/fail in test logs or UI badge states) when strictly necessary.

---

## 3. GitHub Application Guidelines

### 3.1 Git Commit Messages
- **Title (Subject)**:
  - Start with an imperative verb (e.g., `Add`, `Fix`, `Update`, `Remove`, `Refactor`, `Document`).
  - Capitalize the first letter.
  - Do not put a period at the end.
  - Keep under 50-72 characters.
  - Do not include emojis in commit titles.
- **Body** (when needed):
  - State what changed and why in 1-3 short sentences.
  - Follow ASD-STE100 sentence length rules (under 20 words per sentence).

### 3.2 Pull Requests and Issues
- **Summary**: Concise overview of the purpose.
- **Key Changes**: Bulleted list with 1 direct change per bullet.
- **Verification / How to Test**: Numbered list with 1 action per step.
  - Example:
    1. Run `make build`.
    2. Start the daemon with `./bin/mininas-mac`.
    3. Open `http://localhost:8080` in the browser.
    4. Confirm that the dashboard status is `Online`.

### 3.3 Korean Communication Standard
When writing PR comments, issue replies, release notes, or documentation in Korean, apply the same ASD-STE100 philosophy:
- 1문장 1의미의 단문 위주로 작성합니다.
- 불필요한 피동 표현(~되어지다, ~에 의해 처리되다)을 배제하고 능동형으로 서술합니다.
- 모호한 한자어 및 복잡한 수식어를 줄이고, 직관적이고 명확한 실무 용어를 사용합니다.
- 작업 절차는 번호 매기기 목록으로 단계당 하나의 행동만 기술합니다.
- **장식용 이모지 최소화 (AI Slop 배제)**:
  - 제목(Header), 목록 머리글(Bullet), 커밋 메시지, 본문에 의미 없는 장식용 이모지(🌟, 🚀, 📌, 💡, ⚡, 🛡️ 등)를 사용하지 않습니다.
  - 과장된 수식어와 이모지 도배를 배제하고, 절제되고 신뢰성 있는 엔지니어링 문서 톤앤매너를 유지합니다.
