// Local storage wrapper for offline persistence
const STORAGE_KEY = 'academy_progress';

const defaultProgress = {
  completedLectures: [],
  quizScores: {},
  flashcardsReviewed: [],
  readingProgress: {},
  notes: {},
  bookmarks: [],
  currentCourse: null,
  streak: 0,
  lastActive: null,
  totalStudyMinutes: 0,
};

export function getProgress() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? { ...defaultProgress, ...JSON.parse(stored) } : { ...defaultProgress };
  } catch {
    return { ...defaultProgress };
  }
}

export function saveProgress(updates) {
  try {
    const current = getProgress();
    const merged = { ...current, ...updates, lastActive: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  } catch {
    return getProgress();
  }
}

export function markLectureComplete(courseCode, lectureNum) {
  const progress = getProgress();
  const key = `${courseCode}-L${lectureNum}`;
  if (!progress.completedLectures.includes(key)) {
    progress.completedLectures.push(key);
  }
  return saveProgress(progress);
}

export function saveQuizScore(quizId, score, total) {
  const progress = getProgress();
  progress.quizScores[quizId] = { score, total, date: new Date().toISOString() };
  return saveProgress(progress);
}

export function markFlashcardReviewed(cardId) {
  const progress = getProgress();
  if (!progress.flashcardsReviewed.includes(cardId)) {
    progress.flashcardsReviewed.push(cardId);
  }
  return saveProgress(progress);
}

export function addBookmark(item) {
  const progress = getProgress();
  progress.bookmarks.push({ ...item, date: new Date().toISOString() });
  return saveProgress(progress);
}

export function addNote(courseCode, lectureNum, text) {
  const progress = getProgress();
  const key = `${courseCode}-L${lectureNum}`;
  if (!progress.notes[key]) progress.notes[key] = [];
  progress.notes[key].push({ text, date: new Date().toISOString() });
  return saveProgress(progress);
}

export function getStats() {
  const p = getProgress();
  return {
    lecturesCompleted: p.completedLectures.length,
    quizzesTaken: Object.keys(p.quizScores).length,
    averageScore: Object.values(p.quizScores).length > 0
      ? Math.round(Object.values(p.quizScores).reduce((a, s) => a + (s.score / s.total) * 100, 0) / Object.values(p.quizScores).length)
      : 0,
    flashcardsReviewed: p.flashcardsReviewed.length,
    totalNotes: Object.values(p.notes).reduce((a, n) => a + n.length, 0),
    bookmarks: p.bookmarks.length,
  };
}

export function resetProgress() {
  localStorage.removeItem(STORAGE_KEY);
  return { ...defaultProgress };
}
