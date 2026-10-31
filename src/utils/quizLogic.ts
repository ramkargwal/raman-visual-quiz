export interface QuizItem {
  Name: string;
  Hindi: string;
  Description: string;
  link: string;
}

export interface PreparedQuestion {
  q: string;
  plainText: string;
  o: string[];
  o_items: QuizItem[];
  a: number;
  correctItemData: QuizItem;
  _timedOut?: boolean;
  userAnswerIndex?: number | null;
}

export interface SavedVisualQuiz {
  id: string;
  name: string;
  category: string;
  data: string;
  timestamp: number;
  questionCount: number;
}

export interface BuildVisualPromptOptions {
  topicOrNotes?: string;
  questionCount?: number;
  difficulty?: string;
  languageStyle?: string;
}

export function safeParsePhotoData(raw: string): Record<string, unknown>[] {
  let txt = raw.trim();
  if (!txt) return [];
  if (!txt.startsWith('[')) txt = '[' + txt;
  if (!txt.endsWith(']')) txt = txt.replace(/,\s*$/, '') + ']';

  try {
    const parsed = JSON.parse(txt.replace(/,\s*([}\]])/g, '$1'));
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    const extractedItems: Record<string, unknown>[] = [];
    const objStrings = txt.match(/\{[\s\S]*?\}/g) || [];
    objStrings.forEach((objStr) => {
      try {
        let clean = objStr.replace(/,\s*\}/g, '}');
        clean = clean.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
        extractedItems.push(JSON.parse(clean));
      } catch {
        // Ignore unrecoverable fragments
      }
    });
    return extractedItems;
  }
}

export function normalizeQuizItems(extractedItems: unknown[]): QuizItem[] {
  if (!Array.isArray(extractedItems)) return [];
  return extractedItems
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => {
      let fixedLink = String(item.link || item.Link || item.LINK || '');
      const parsedName = String(item.Name || item.name || item.NAME || '');
      const parsedHindi = String(item.Hindi || item.hindi || item.HINDI || '');
      const parsedDesc = String(
        item.Description || item.description || item.DESCRIPTION || item.desc || '',
      );

      if (
        fixedLink &&
        (fixedLink.includes('wikimedia.org') || fixedLink.includes('wikipedia.org')) &&
        !fixedLink.includes('/thumb/')
      ) {
        const cleanUrl = fixedLink.split('?')[0];
        const rawPart = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1);
        let filename = rawPart;
        try {
          filename = decodeURIComponent(rawPart);
        } catch {
          // Keep rawPart if percent-encoding is malformed
        }
        filename = filename.replace(/^File:/i, '');
        if (filename) {
          fixedLink = `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}?width=600`;
        }
      }

      return {
        Name: parsedName.trim(),
        Hindi: parsedHindi.trim(),
        Description: parsedDesc.trim(),
        link: fixedLink.trim(),
      };
    })
    .filter((item) => Boolean(item.Name && item.link));
}

export function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function prepareVisualQuiz(itemsToPlay: QuizItem[], rawItems: QuizItem[]): PreparedQuestion[] {
  return itemsToPlay.map((correctItem) => {
    let incorrectPool = rawItems.filter(
      (i) => i !== correctItem && i.Name !== correctItem.Name,
    );
    if (incorrectPool.length < 3) {
      incorrectPool = rawItems.filter((i) => i !== correctItem);
    }
    incorrectPool = shuffleArray(incorrectPool);
    const optionsSet = shuffleArray([
      correctItem,
      incorrectPool[0],
      incorrectPool[1],
      incorrectPool[2],
    ]);
    const correctIndex = optionsSet.indexOf(correctItem);

    let questionHTML = `<span class="text-blue-600">${correctItem.Name}</span>`;
    if (correctItem.Hindi) {
      questionHTML += `<span class="hi-text">${correctItem.Hindi}</span>`;
    }

    let speakText = correctItem.Name;
    if (correctItem.Hindi) speakText += ' . ' + correctItem.Hindi;

    return {
      q: questionHTML,
      plainText: speakText,
      o: optionsSet.map((opt) => opt.link),
      o_items: optionsSet,
      a: correctIndex,
      correctItemData: correctItem,
    };
  });
}

export function getGrade(acc: number): { grade: string; msg: string } {
  if (acc >= 90) return { grade: 'A+', msg: 'Excellent! Outstanding performance 🎉' };
  if (acc >= 80) return { grade: 'A', msg: 'Great job! Very well done 👏' };
  if (acc >= 70) return { grade: 'B', msg: 'Good effort! You can still improve 👍' };
  if (acc >= 60) return { grade: 'C', msg: 'Not bad, keep learning 📚' };
  if (acc >= 40) return { grade: 'D', msg: 'Needs more practice 🔁' };
  return { grade: 'F', msg: "Don't give up! Try again 💪" };
}

export function formatExamTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function evaluateVisualExamSubmission(
  activeQuiz: PreparedQuestion[],
  examAnswers: Record<number, number>,
): {
  score: number;
  wrong: number;
  skipped: number;
  wrongQuestions: PreparedQuestion[];
} {
  let score = 0;
  let wrong = 0;
  let skipped = 0;
  const wrongQuestions: PreparedQuestion[] = [];

  activeQuiz.forEach((q, idx) => {
    const userAns = examAnswers[idx];
    if (userAns === undefined || userAns === null) {
      skipped++;
      wrongQuestions.push({ ...q, _timedOut: true, userAnswerIndex: null });
    } else if (userAns === q.a) {
      score++;
    } else {
      wrong++;
      wrongQuestions.push({ ...q, _timedOut: false, userAnswerIndex: userAns });
    }
  });

  return { score, wrong, skipped, wrongQuestions };
}

export function buildVisualAiPrompt(options: BuildVisualPromptOptions = {}): string {
  const count = Math.min(200, Math.max(4, options.questionCount ?? 50));
  const difficulty = options.difficulty || 'Medium';
  const languageStyle = options.languageStyle || 'Hinglish';
  const topic = (options.topicOrNotes || '').trim();

  const langRule =
    languageStyle === 'English'
      ? '* Keep "Name" and "Description" in clear English. Provide the common Hindi transliteration or name in "Hindi".'
      : languageStyle === 'Hindi'
      ? '* Provide accurate Hindi names in "Hindi" and write "Description" in pure, natural Hindi (1–2 informative sentences) while keeping scientific/technical terms in English.'
      : '* Keep all scientific, technical, brand, product, software, hardware, and industry-standard terms in English. Use common Hindi names in "Hindi" and write "Description" in easy Hinglish/Hindi (1–2 informative sentences).';

  const topicInstruction = topic
    ? `Topic / Study Notes:\n"${topic}"\n\nGenerate a valid JSON array of exactly ${count} unique items for the above topic using this format:`
    : `I will provide a topic in my next message. Do NOT generate JSON until the topic is given.\n\nWhen a topic is provided, generate a valid JSON array of exactly ${count} unique items using this format:`;

  const closingLine = topic
    ? 'Begin generating the raw JSON array now.'
    : 'If you understand, reply exactly:\nReady for your content or topic.';

  return `Act as an Expert Educational Content Creator for a Visual Identification Quiz.

Difficulty Level: ${difficulty}
Language Style: ${languageStyle}

${topicInstruction}

[
  {
    "Name": "English Name",
    "Hindi": "हिंदी नाम",
    "Description": "हिंदी विवरण",
    "link": "Direct image URL"
  }
]

Rules:

${langRule}
* Target Difficulty: ${difficulty} level items suitable for visual identification.
* Every item must include a direct, publicly accessible image URL suitable for visual identification.
* Prefer fast-loading thumbnail images. For Wikimedia Commons use:
  https://commons.wikimedia.org/wiki/Special:FilePath/Filename.jpg?width=600
* Generate exactly ${count} unique, topic-relevant items with accurate names, descriptions, and images.
* Output ONLY the raw pretty-printed JSON array.
* No markdown, code blocks, explanations, comments, or extra text.

${closingLine}`;
}

export function exportVisualQuizzesToText(
  quizzes: SavedVisualQuiz[],
  starredItems: QuizItem[] = [],
): string {
  const blocks: string[] = [];
  quizzes.forEach((q) => {
    const cat = (q.category || 'General').trim() || 'General';
    blocks.push(
      `=== QUIZ: ${q.name} | CATEGORY: ${cat} ===\n${q.data.trim()}`,
    );
  });
  if (starredItems.length > 0) {
    blocks.push(
      `=== STARRED_ITEMS ===\n${JSON.stringify(starredItems, null, 2)}`,
    );
  }
  return blocks.join('\n\n');
}

export function importVisualQuizzesFromText(
  rawText: string,
  existingQuizzes: SavedVisualQuiz[],
  existingStarred: QuizItem[],
  fallbackName = 'Imported Dataset',
): {
  quizzes: SavedVisualQuiz[];
  starredItems: QuizItem[];
  importedCount: number;
} {
  const text = rawText.trim();
  if (!text) {
    return { quizzes: existingQuizzes, starredItems: existingStarred, importedCount: 0 };
  }

  const updatedQuizzes = [...existingQuizzes];
  let updatedStarred = [...existingStarred];
  let importedCount = 0;

  if (/===\s*(QUIZ\s*:|STARRED_ITEMS)/i.test(text)) {
    const sections = text.split(/(?====\s*(?:QUIZ\s*:|STARRED_ITEMS))/i);
    sections.forEach((sec, idx) => {
      const trimmed = sec.trim();
      if (!trimmed) return;

      const starredMatch = trimmed.match(/^===\s*STARRED_ITEMS\s*===\s*([\s\S]*)$/i);
      if (starredMatch) {
        const items = normalizeQuizItems(safeParsePhotoData(starredMatch[1]));
        items.forEach((item) => {
          if (!updatedStarred.some((s) => s.Name.toLowerCase() === item.Name.toLowerCase())) {
            updatedStarred = [item, ...updatedStarred];
          }
        });
        if (items.length > 0) importedCount++;
        return;
      }

      const headerMatch = trimmed.match(
        /^===\s*QUIZ\s*:\s*([^|=\n]+?)(?:\s*\|\s*CATEGORY\s*:\s*([^=\n]+?))?\s*===\s*([\s\S]*)$/i,
      );
      if (headerMatch) {
        const name = headerMatch[1].trim() || `${fallbackName} ${idx + 1}`;
        const category = (headerMatch[2] || 'General').trim() || 'General';
        const body = headerMatch[3].trim();
        const validItems = normalizeQuizItems(safeParsePhotoData(body));
        if (validItems.length >= 4) {
          const normalizedJson = JSON.stringify(validItems, null, 2);
          const existingIdx = updatedQuizzes.findIndex(
            (q) => q.name.toLowerCase() === name.toLowerCase(),
          );
          const entry: SavedVisualQuiz = {
            id: existingIdx >= 0 ? updatedQuizzes[existingIdx].id : `vquiz_${Date.now()}_${idx}`,
            name,
            category,
            data: normalizedJson,
            timestamp: Date.now(),
            questionCount: validItems.length,
          };
          if (existingIdx >= 0) {
            updatedQuizzes[existingIdx] = entry;
          } else {
            updatedQuizzes.unshift(entry);
          }
          importedCount++;
        }
      }
    });

    return {
      quizzes: updatedQuizzes,
      starredItems: updatedStarred,
      importedCount,
    };
  }

  // Fallback: single JSON dataset import
  const validItems = normalizeQuizItems(safeParsePhotoData(text));
  if (validItems.length >= 4) {
    const normalizedJson = JSON.stringify(validItems, null, 2);
    const existingIdx = updatedQuizzes.findIndex(
      (q) => q.name.toLowerCase() === fallbackName.toLowerCase(),
    );
    const entry: SavedVisualQuiz = {
      id: existingIdx >= 0 ? updatedQuizzes[existingIdx].id : `vquiz_${Date.now()}`,
      name: fallbackName,
      category: 'General',
      data: normalizedJson,
      timestamp: Date.now(),
      questionCount: validItems.length,
    };
    if (existingIdx >= 0) {
      updatedQuizzes[existingIdx] = entry;
    } else {
      updatedQuizzes.unshift(entry);
    }
    importedCount = 1;
  }

  return {
    quizzes: updatedQuizzes,
    starredItems: updatedStarred,
    importedCount,
  };
}
