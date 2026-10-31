import test from 'node:test';
import assert from 'node:assert/strict';
import {
  safeParsePhotoData,
  normalizeQuizItems,
  prepareVisualQuiz,
  getGrade,
  formatExamTime,
  evaluateVisualExamSubmission,
  buildVisualAiPrompt,
  exportVisualQuizzesToText,
  importVisualQuizzesFromText,
} from './quizLogic';

test('safeParsePhotoData parses valid JSON and recovers malformed JSON objects', () => {
  const valid = safeParsePhotoData('[{"Name":"Lion","link":"https://example.com/lion.jpg"}]');
  assert.equal(valid.length, 1);
  assert.equal(valid[0].Name, 'Lion');

  const malformed = safeParsePhotoData('[{Name: "Tiger", link: "https://example.com/tiger.jpg",}]');
  assert.equal(malformed.length, 1);
  assert.equal(malformed[0].Name, 'Tiger');
});

test('normalizeQuizItems handles case-insensitive keys and avoids duplicate ?width=600 on Wikimedia URLs', () => {
  const raw = [
    {
      name: 'Peacock',
      hindi: 'मोर',
      desc: 'राष्ट्रीय पक्षी',
      LINK: 'https://commons.wikimedia.org/wiki/File:Peacock.jpg',
    },
    {
      Name: 'Tiger',
      link: 'https://commons.wikimedia.org/wiki/Special:FilePath/Tiger.jpg?width=600',
    },
    {
      Name: 'Elephant',
      link: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Elephant.jpg/600px-Elephant.jpg',
    },
  ];

  const normalized = normalizeQuizItems(raw);
  assert.equal(normalized.length, 3);
  assert.equal(
    normalized[0].link,
    'https://commons.wikimedia.org/wiki/Special:FilePath/Peacock.jpg?width=600',
  );
  assert.equal(
    normalized[1].link,
    'https://commons.wikimedia.org/wiki/Special:FilePath/Tiger.jpg?width=600',
  );
  assert.equal(
    normalized[2].link,
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Elephant.jpg/600px-Elephant.jpg',
  );
});

test('prepareVisualQuiz creates 4 options and sets accurate correct answer index', () => {
  const pool = [
    { Name: 'Item 1', Hindi: 'आइटम 1', Description: 'Desc 1', link: 'https://example.com/1.jpg' },
    { Name: 'Item 2', Hindi: 'आइटम 2', Description: 'Desc 2', link: 'https://example.com/2.jpg' },
    { Name: 'Item 3', Hindi: 'आइटम 3', Description: 'Desc 3', link: 'https://example.com/3.jpg' },
    { Name: 'Item 4', Hindi: 'आइटम 4', Description: 'Desc 4', link: 'https://example.com/4.jpg' },
  ];

  const questions = prepareVisualQuiz(pool, pool);
  assert.equal(questions.length, 4);
  for (const q of questions) {
    assert.equal(q.o.length, 4);
    assert.equal(q.o[q.a], q.correctItemData.link);
  }
});

test('formatExamTime formats MM:SS and HH:MM:SS accurately', () => {
  assert.equal(formatExamTime(90), '01:30');
  assert.equal(formatExamTime(5), '00:05');
  assert.equal(formatExamTime(3661), '01:01:01');
});

test('evaluateVisualExamSubmission scores answered, wrong, and skipped questions properly', () => {
  const pool = [
    { Name: 'Item 1', Hindi: '', Description: '', link: 'https://example.com/1.jpg' },
    { Name: 'Item 2', Hindi: '', Description: '', link: 'https://example.com/2.jpg' },
    { Name: 'Item 3', Hindi: '', Description: '', link: 'https://example.com/3.jpg' },
    { Name: 'Item 4', Hindi: '', Description: '', link: 'https://example.com/4.jpg' },
  ];
  const activeQuiz = prepareVisualQuiz(pool, pool);
  const wrongChoice = (activeQuiz[1].a + 1) % 4;
  const answers: Record<number, number> = {
    0: activeQuiz[0].a, // Correct
    1: wrongChoice, // Wrong
    // 2 and 3 left unanswered (Skipped)
  };

  const result = evaluateVisualExamSubmission(activeQuiz, answers);
  assert.equal(result.score, 1);
  assert.equal(result.wrong, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.wrongQuestions.length, 3);
});

test('buildVisualAiPrompt embeds custom topic, question count, difficulty, and language', () => {
  const promptWithTopic = buildVisualAiPrompt({
    topicOrNotes: 'Indian Birds',
    questionCount: 25,
    difficulty: 'Hard',
    languageStyle: 'Hindi',
  });
  assert.equal(promptWithTopic.includes('Indian Birds'), true);
  assert.equal(promptWithTopic.includes('25'), true);
  assert.equal(promptWithTopic.includes('Hard'), true);
  assert.equal(promptWithTopic.includes('Hindi'), true);
});

test('exportVisualQuizzesToText and importVisualQuizzesFromText round-trip database and starred items', () => {
  const sampleItems = [
    { Name: 'A', Hindi: 'ए', Description: 'D1', link: 'https://example.com/a.jpg' },
    { Name: 'B', Hindi: 'बी', Description: 'D2', link: 'https://example.com/b.jpg' },
    { Name: 'C', Hindi: 'सी', Description: 'D3', link: 'https://example.com/c.jpg' },
    { Name: 'D', Hindi: 'डी', Description: 'D4', link: 'https://example.com/d.jpg' },
  ];
  const saved = [
    {
      id: 'q1',
      name: 'Alpha Set',
      category: 'Science',
      data: JSON.stringify(sampleItems, null, 2),
      timestamp: 1000,
      questionCount: 4,
    },
  ];
  const starred = [sampleItems[0]];

  const exported = exportVisualQuizzesToText(saved, starred);
  assert.equal(exported.includes('=== QUIZ: Alpha Set | CATEGORY: Science ==='), true);
  assert.equal(exported.includes('=== STARRED_ITEMS ==='), true);

  const imported = importVisualQuizzesFromText(exported, [], []);
  assert.equal(imported.quizzes.length, 1);
  assert.equal(imported.quizzes[0].name, 'Alpha Set');
  assert.equal(imported.quizzes[0].category, 'Science');
  assert.equal(imported.starredItems.length, 1);
  assert.equal(imported.starredItems[0].Name, 'A');
});

test('getGrade returns expected grade thresholds', () => {
  assert.equal(getGrade(95).grade, 'A+');
  assert.equal(getGrade(80).grade, 'A');
  assert.equal(getGrade(72).grade, 'B');
  assert.equal(getGrade(60).grade, 'C');
  assert.equal(getGrade(45).grade, 'D');
  assert.equal(getGrade(20).grade, 'F');
});
