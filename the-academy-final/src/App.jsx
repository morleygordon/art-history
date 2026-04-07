import { useState, useEffect } from 'react';
import { FACULTY, BUSINESS_FACULTY } from './data/faculty';
import { UNDERGRADUATE_CURRICULUM, GRADUATE_CURRICULUM } from './data/curriculum';
import { LECTURE_CONTENT } from './data/lectures';
import { GLOSSARY } from './data/glossary';
import { TIMELINE, FLASHCARDS } from './data/timeline';
import { QUIZZES, ESSAY_PROMPTS } from './data/assessments';
import { getProgress, saveProgress, markLectureComplete, saveQuizScore, getStats, resetProgress } from './utils/storage';

// ─── CONSTANTS ──────────────────────────────────────────────────────
const TABS = [
  { id: 'home', label: 'Home', icon: '🏛️' },
  { id: 'curriculum', label: 'Courses', icon: '📖' },
  { id: 'faculty', label: 'Faculty', icon: '👨‍🏫' },
  { id: 'lectures', label: 'Lectures', icon: '🎓' },
  { id: 'assessments', label: 'Tests', icon: '📝' },
  { id: 'flashcards', label: 'Cards', icon: '🃏' },
  { id: 'timeline', label: 'Timeline', icon: '📅' },
  { id: 'glossary', label: 'Glossary', icon: '📕' },
  { id: 'museums', label: 'Museums', icon: '🖼️' },
  { id: 'office', label: 'Office Hrs', icon: '💬' },
  { id: 'progress', label: 'Progress', icon: '📊' },
];

// ─── MAIN APP ───────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('home');
  const [sub, setSub] = useState(null); // sub-navigation state
  const [showGrad, setShowGrad] = useState(false);
  const [progress, setProgress] = useState(getProgress());

  // Quiz state
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  // Flashcard state
  const [cardIndex, setCardIndex] = useState(0);
  const [cardFlipped, setCardFlipped] = useState(false);

  // Glossary search
  const [glossarySearch, setGlossarySearch] = useState('');

  // Timeline filter
  const [timelineFilter, setTimelineFilter] = useState('all');

  // Museum search
  const [museumQuery, setMuseumQuery] = useState('');
  const [museumResults, setMuseumResults] = useState(null);
  const [museumLoading, setMuseumLoading] = useState(false);

  // Office Hours
  const [ohQuestion, setOhQuestion] = useState('');
  const [ohHistory, setOhHistory] = useState([]);
  const [ohLoading, setOhLoading] = useState(false);

  // TTS state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechRate, setSpeechRate] = useState(1.0);

  const speakLecture = (text) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Split into chunks (browsers have a ~200 word limit per utterance)
    const sentences = text.replace(/\n\n/g, '. ').split(/(?<=[.!?])\s+/);
    const chunks = [];
    let current = '';
    for (const s of sentences) {
      if ((current + ' ' + s).length > 800) { chunks.push(current); current = s; }
      else { current = current ? current + ' ' + s : s; }
    }
    if (current) chunks.push(current);

    let i = 0;
    const speakNext = () => {
      if (i >= chunks.length) { setIsSpeaking(false); return; }
      const utter = new SpeechSynthesisUtterance(chunks[i]);
      utter.rate = speechRate;
      utter.pitch = 1.0;
      // Prefer a natural voice
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Google UK English'));
      if (preferred) utter.voice = preferred;
      utter.onend = () => { i++; speakNext(); };
      utter.onerror = () => { i++; speakNext(); };
      window.speechSynthesis.speak(utter);
    };
    setIsSpeaking(true);
    speakNext();
  };

  const stopSpeaking = () => { window.speechSynthesis?.cancel(); setIsSpeaking(false); };

  // Cleanup on unmount or tab change
  useEffect(() => { return () => window.speechSynthesis?.cancel(); }, [tab, sub]);

  const navigate = (newTab, subState = null) => { stopSpeaking(); setTab(newTab); setSub(subState); };

  // ─── MUSEUM SEARCH (Claude API via serverless) ──────────────────
  const callAPI = async (messages, system = '', max_tokens = 4000) => {
    // Try serverless function first (Vercel), fall back to direct API (Claude artifact)
    const endpoints = ['/api/chat', 'https://api.anthropic.com/v1/messages'];
    for (const url of endpoints) {
      try {
        const isProxy = url.startsWith('/');
        const body = isProxy
          ? { messages, system, max_tokens }
          : { model: 'claude-sonnet-4-20250514', max_tokens, system, messages };
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.ok) return await resp.json();
      } catch (e) { continue; }
    }
    throw new Error('API unavailable');
  };

  const searchMuseums = async () => {
    if (!museumQuery.trim()) return;
    setMuseumLoading(true);
    setMuseumResults(null);
    try {
      const data = await callAPI([{
        role: 'user',
        content: `You are an expert art historian, museum curator, and travel advisor with encyclopedic knowledge of museums and galleries worldwide — including in countries like North Korea, Iran, Cuba, Myanmar, and every other nation. You know about art museums, national galleries, archaeological museums, contemporary art spaces, private collections open to the public, sculpture parks, and historic sites with significant art.

The user is planning a trip to: "${museumQuery}"

Return ONLY a valid JSON array (no markdown, no backticks, no preamble text). Stack-rank the museums from most essential to least essential.

For MAJOR ART CITIES (New York, London, Paris, Florence, Madrid, Berlin, Tokyo, etc.), include 8-15 museums/galleries.
For MID-SIZE cities, include 4-8.
For SMALL cities or unusual destinations, include whatever exists — even a single gallery, historic church with frescoes, or archaeological site with art.

Format:
[
  {
    "rank": 1,
    "museum": "Museum Name",
    "address": "Full address",
    "description": "2-3 sentences on why this museum matters, its strengths, and what makes it distinctive",
    "mustSee": [
      {
        "work": "Exact title of the work",
        "artist": "Artist name (or culture/period if anonymous)",
        "date": "Date or period",
        "medium": "Oil on canvas, marble, bronze, etc.",
        "why": "3-4 sentences: why this specific work is special, unique, or historically significant. What makes it a must-see. Be specific about technique, innovation, or historical importance.",
        "value": "Estimated market value OR designation (e.g., 'Priceless — national patrimony', 'Estimated $200M+ based on comparable sales', 'National Treasure designation', 'Insured for $500M'). Be as specific as possible.",
        "provenance": "3-4 sentences: how the work ended up in this museum. Include key dates, donors, purchases, or historical circumstances (war, revolution, gift, excavation, etc.)"
      }
    ]
  }
]

Include 3-5 must-see works per museum for top-ranked museums, 2-3 for lower-ranked ones. Be ACCURATE — only list works that are actually in these collections. If unsure, note that the work may be on loan or in storage.`
      }], '', 8000);
      const text = data.content?.map(c => c.text || '').join('') || '';
      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      setMuseumResults(parsed);
    } catch (err) {
      console.error('Museum search error:', err);
      setMuseumResults('error');
    }
    setMuseumLoading(false);
  };

  // ─── OFFICE HOURS (Claude API via serverless) ───────────────────
  const askOfficeHours = async () => {
    if (!ohQuestion.trim()) return;
    const q = ohQuestion;
    setOhQuestion('');
    setOhHistory(prev => [...prev, { role: 'student', text: q }]);
    setOhLoading(true);
    try {
      const data = await callAPI(
        [...ohHistory.map(m => ({ role: m.role === 'student' ? 'user' : 'assistant', content: m.text })), { role: 'user', content: q }],
        `You are a distinguished art history professor holding virtual office hours. You are one of the world's 50 greatest art historians. Respond with deep scholarly knowledge, specific references to artworks and texts, connections between periods and theories, practical advice for aspiring curators/auction specialists/academics, and a warm but rigorous tone. Give substantive responses of 3-5 paragraphs. Reference specific works, scholars, and methods.`,
        2000
      );
      const text = data.content?.map(c => c.text || '').join('') || 'I apologize, but I was unable to formulate a response. Please try rephrasing your question.';
      setOhHistory(prev => [...prev, { role: 'professor', text }]);
    } catch {
      setOhHistory(prev => [...prev, { role: 'professor', text: 'My apologies — there was a technical difficulty. Please try again.' }]);
    }
    setOhLoading(false);
  };

  // ─── QUIZ HANDLERS ────────────────────────────────────────────
  const startQuiz = (quiz) => { setActiveQuiz(quiz); setQuizAnswers({}); setQuizSubmitted(false); };
  const submitQuiz = () => {
    setQuizSubmitted(true);
    const score = activeQuiz.questions.reduce((acc, q, i) => acc + (quizAnswers[i] === q.correct ? 1 : 0), 0);
    saveQuizScore(activeQuiz.id, score, activeQuiz.questions.length);
    setProgress(getProgress());
  };

  // ─── GLOSSARY FILTER ──────────────────────────────────────────
  const filteredGlossary = glossarySearch
    ? GLOSSARY.filter(g => g.term.toLowerCase().includes(glossarySearch.toLowerCase()) || g.definition.toLowerCase().includes(glossarySearch.toLowerCase()))
    : GLOSSARY;

  // ─── TIMELINE FILTER ──────────────────────────────────────────
  const filteredTimeline = timelineFilter === 'all'
    ? TIMELINE
    : TIMELINE.filter(t => t.category === timelineFilter);

  const stats = getStats();

  // ─── ALL COURSES FLAT ─────────────────────────────────────────
  const allCourses = [...UNDERGRADUATE_CURRICULUM, ...GRADUATE_CURRICULUM].flatMap(y => y.semesters.flatMap(s => s.courses));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* ═══ HEADER ═══ */}
      <header style={{ background: 'linear-gradient(180deg, #13110e 0%, #0a0806 100%)', borderBottom: '1px solid var(--border)', padding: '20px 16px 0', flexShrink: 0 }}>
        <div style={{ textAlign: 'center', marginBottom: 12, cursor: 'pointer' }} onClick={() => navigate('home')}>
          <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 6, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Universitas Artium</div>
          <h1 style={{ fontSize: 24, fontWeight: 300, letterSpacing: 4, color: 'var(--gold)', lineHeight: 1.2 }}>THE ACADEMY</h1>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: 3, color: 'var(--text-faint)', marginTop: 2 }}>Est. in aeternum</div>
        </div>
        <nav style={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap', maxWidth: 700, margin: '0 auto' }}>
          {TABS.map(t => (
            <button key={t.id} className={`tab-btn ${tab === t.id ? 'active' : ''}`} onClick={() => navigate(t.id)}>
              <span style={{ fontSize: 14 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ═══ CONTENT ═══ */}
      <main style={{ flex: 1, padding: '24px 16px', maxWidth: 800, margin: '0 auto', width: '100%' }}>

        {/* ═══════════════════ HOME ═══════════════════ */}
        {tab === 'home' && (
          <div className="fade-in">
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🏛️</div>
              <h2 style={{ fontSize: 22, fontWeight: 300, color: 'var(--gold)', letterSpacing: 2, marginBottom: 6 }}>Welcome to The Academy</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-muted)', maxWidth: 500, margin: '0 auto', lineHeight: 1.7 }}>
                The world's 50 greatest art historians, assembled as your faculty. Complete undergraduate & graduate education in art history, curatorial practice, and the business of art.
              </p>
            </div>
            <div className="gold-line" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[{ n: '58', l: 'Faculty' }, { n: '40+', l: 'Courses' }, { n: '6', l: 'Years' }].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 14, textAlign: 'center', borderRadius: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 300, color: 'var(--gold)' }}>{s.n}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase' }}>{s.l}</div>
                </div>
              ))}
            </div>
            <div className="gold-line" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Features</div>
            {[
              { icon: '📖', t: 'Full Curriculum', d: '40+ courses from Prehistory to Contemporary, plus Business of Art' },
              { icon: '🎓', t: 'Granular Lectures', d: 'Complete lecture content with visual analysis, discussion questions, and readings' },
              { icon: '🖼️', t: 'AI Museum Search', d: 'Search any city — get museum recommendations with must-see works, values, and provenance' },
              { icon: '📝', t: 'Assessments', d: 'Quizzes, midterms, finals, and essay prompts with instant grading' },
              { icon: '🃏', t: 'Flashcards', d: 'Visual ID practice for exam preparation' },
              { icon: '📅', t: 'Interactive Timeline', d: '65+ key moments from 36,000 BC to present' },
              { icon: '📕', t: 'Glossary', d: '75+ art history terms with definitions and pronunciation' },
              { icon: '💬', t: 'AI Office Hours', d: 'Ask any question — get expert scholarly responses' },
              { icon: '📊', t: 'Progress Tracking', d: 'Track lectures, quiz scores, and study streaks offline' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                <span style={{ fontSize: 18 }}>{f.icon}</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{f.t}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>{f.d}</div>
                </div>
              </div>
            ))}
            <div className="gold-line" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Career Pathways</div>
            {[
              { t: 'Museum Curator', d: 'Lead exhibitions at the Met, Louvre, Tate, or MoMA.' },
              { t: 'Auction Specialist', d: 'Work at Sotheby\'s, Christie\'s, or Phillips.' },
              { t: 'University Professor', d: 'Teach art history at leading institutions.' },
            ].map((c, i) => (
              <div key={i} className="card static">
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{c.t}</div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>{c.d}</p>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════ CURRICULUM ═══════════════════ */}
        {tab === 'curriculum' && !sub && (
          <div className="fade-in">
            <div className="section-title">Curriculum</div>
            <div className="section-sub">Complete Course Catalogue</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <button className={`toggle-btn ${!showGrad ? 'active' : ''}`} onClick={() => setShowGrad(false)}>Undergraduate (4 yr)</button>
              <button className={`toggle-btn ${showGrad ? 'active' : ''}`} onClick={() => setShowGrad(true)}>Graduate MA (2 yr)</button>
            </div>
            {(showGrad ? GRADUATE_CURRICULUM : UNDERGRADUATE_CURRICULUM).map((year, yi) => (
              <div key={yi} style={{ marginBottom: 28 }}>
                <h3 style={{ fontSize: 17, fontWeight: 500, color: 'var(--gold)', marginBottom: 14 }}>{year.year}</h3>
                {year.semesters.map((sem, si) => (
                  <div key={si} style={{ marginBottom: 18 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>{sem.name}</div>
                    {sem.courses.map((course, ci) => (
                      <div key={ci} className="card" onClick={() => setSub({ type: 'course', data: course })}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span className="badge">{course.code}</span>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>{course.lectures} lectures</span>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 3 }}>{course.title}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>Prof. {course.instructor}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ═══ COURSE DETAIL ═══ */}
        {tab === 'curriculum' && sub?.type === 'course' && (
          <div className="fade-in">
            <button className="btn-outline" onClick={() => setSub(null)} style={{ marginBottom: 16 }}>← Back</button>
            <span className="badge">{sub.data.code}</span>
            <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--gold)', marginTop: 8, marginBottom: 4 }}>{sub.data.title}</h2>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Professor {sub.data.instructor} · {sub.data.lectures} lectures</div>
            <div className="gold-line" />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>{sub.data.description}</p>

            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold)', marginBottom: 10 }}>Lecture Schedule</h3>
            {sub.data.topics.map((t, i) => {
              const key = `${sub.data.code}-L${i + 1}`;
              const completed = progress.completedLectures.includes(key);
              const hasContent = LECTURE_CONTENT[sub.data.code]?.lectures?.find(l => l.num === i + 1);
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--bg-tertiary)', cursor: hasContent ? 'pointer' : 'default' }}
                  onClick={() => hasContent && navigate('lectures', { courseCode: sub.data.code, lectureNum: i + 1 })}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: completed ? 'var(--success)' : 'var(--text-faint)', minWidth: 28 }}>
                    {completed ? '✓' : String(i + 1).padStart(2, '0')}
                  </span>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: hasContent ? 'var(--gold)' : 'var(--text-secondary)', flex: 1 }}>{t}</span>
                  {hasContent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>→</span>}
                </div>
              );
            })}

            <div className="gold-line" />
            <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold)', marginBottom: 10 }}>Required Reading</h3>
            {sub.data.readings.map((r, i) => (
              <div key={i} style={{ padding: '8px 0 8px 16px', borderLeft: '2px solid var(--border)', marginBottom: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>{r}</div>
            ))}
          </div>
        )}

        {/* ═══════════════════ LECTURES ═══════════════════ */}
        {tab === 'lectures' && !sub && (
          <div className="fade-in">
            <div className="section-title">Lectures</div>
            <div className="section-sub">Full Lecture Content</div>
            {Object.entries(LECTURE_CONTENT).map(([code, course]) => (
              <div key={code} style={{ marginBottom: 24 }}>
                <span className="badge">{code}</span>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)', marginTop: 6, marginBottom: 10 }}>{course.title}</h3>
                {course.lectures.map(lec => (
                  <div key={lec.num} className="card" onClick={() => setSub({ courseCode: code, lectureNum: lec.num })}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Lecture {lec.num}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>{lec.duration}</span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{lec.title}</div>
                  </div>
                ))}
              </div>
            ))}
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', marginTop: 20 }}>More lectures are being prepared by our faculty. Check back soon.</p>
          </div>
        )}

        {/* ═══ LECTURE DETAIL ═══ */}
        {tab === 'lectures' && sub && (() => {
          const course = LECTURE_CONTENT[sub.courseCode];
          const lecture = course?.lectures?.find(l => l.num === sub.lectureNum);
          if (!lecture) return <div>Lecture not found.</div>;
          const key = `${sub.courseCode}-L${sub.lectureNum}`;
          const completed = progress.completedLectures.includes(key);
          return (
            <div className="fade-in">
              <button className="btn-outline" onClick={() => setSub(null)} style={{ marginBottom: 16 }}>← Back</button>
              <span className="badge">{sub.courseCode}</span>
              <span className="badge">Lecture {lecture.num}</span>
              <span className="badge">{lecture.duration}</span>
              <h2 style={{ fontSize: 20, fontWeight: 500, color: 'var(--gold)', marginTop: 10, marginBottom: 4 }}>{lecture.title}</h2>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>Prof. {course.instructor}</div>

              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>Key Concepts</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 20 }}>
                {lecture.keyConcepts.map((c, i) => <span key={i} className="badge">{c}</span>)}
              </div>

              <div className="gold-line" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Lecture</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select value={speechRate} onChange={e => setSpeechRate(parseFloat(e.target.value))} style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 10, padding: '4px 6px', borderRadius: 3 }}>
                    <option value={0.75}>0.75x</option>
                    <option value={1.0}>1x</option>
                    <option value={1.25}>1.25x</option>
                    <option value={1.5}>1.5x</option>
                  </select>
                  {!isSpeaking ? (
                    <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 13 }} onClick={() => speakLecture(lecture.content)}>
                      🔊 Listen
                    </button>
                  ) : (
                    <button className="btn-outline" style={{ padding: '6px 14px', fontSize: 13, borderColor: 'var(--error)', color: 'var(--error)' }} onClick={stopSpeaking}>
                      ⏹ Stop
                    </button>
                  )}
                </div>
              </div>
              <div className="lecture-content">
                {lecture.content.split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
              </div>

              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Visual Analysis</div>
              {lecture.visualAnalysis.map((v, i) => (
                <div key={i} className="museum-work">
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{v.work}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{v.date}</div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{v.points}</p>
                </div>
              ))}

              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Discussion Questions</div>
              {lecture.discussionQuestions.map((q, i) => (
                <div key={i} style={{ padding: '10px 0 10px 16px', borderLeft: '2px solid var(--border)', marginBottom: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {q}
                </div>
              ))}

              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 12 }}>Further Reading</div>
              {lecture.furtherReading.map((r, i) => (
                <div key={i} style={{ padding: '6px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>{r}</div>
              ))}

              <div className="gold-line" />
              <button className="btn-gold" style={{ width: '100%' }} onClick={() => { markLectureComplete(sub.courseCode, sub.lectureNum); setProgress(getProgress()); }}>
                {completed ? '✓ Completed' : 'Mark as Complete'}
              </button>
            </div>
          );
        })()}

        {/* ═══════════════════ FACULTY ═══════════════════ */}
        {tab === 'faculty' && !sub && (
          <div className="fade-in">
            <div className="section-title">Faculty</div>
            <div className="section-sub">Art History Department — 50 Scholars</div>
            {FACULTY.map(f => (
              <div key={f.id} className="card" onClick={() => setSub(f)} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ fontSize: 24, minWidth: 36, textAlign: 'center' }}>{f.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)', letterSpacing: 1 }}>{f.specialty}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>{f.dates}</div>
                </div>
              </div>
            ))}
            <div className="gold-line" />
            <div className="section-sub">Business of Art Faculty</div>
            {BUSINESS_FACULTY.map(f => (
              <div key={f.id} className="card" onClick={() => setSub({ ...f, isBusiness: true })}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)' }}>{f.role}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-faint)' }}>{f.dates}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ FACULTY DETAIL ═══ */}
        {tab === 'faculty' && sub && (
          <div className="fade-in">
            <button className="btn-outline" onClick={() => setSub(null)} style={{ marginBottom: 16 }}>← Back</button>
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              {sub.icon && <div style={{ fontSize: 48, marginBottom: 8 }}>{sub.icon}</div>}
              <h2 style={{ fontSize: 22, fontWeight: 400, color: 'var(--gold)' }}>{sub.name}</h2>
              <div className="badge" style={{ marginTop: 6 }}>{sub.specialty || sub.role}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{sub.dates}{sub.era ? ` · ${sub.era}` : ''}</div>
            </div>
            <div className="gold-line" />
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.8 }}>{sub.bio}</p>
            {sub.method && <>
              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>Method</div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gold)', fontStyle: 'italic' }}>{sub.method}</p>
            </>}
            {sub.keyWorks && <>
              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>Key Works</div>
              {sub.keyWorks.map((w, i) => <div key={i} style={{ padding: '6px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', fontStyle: 'italic' }}>{w}</div>)}
            </>}
            {sub.keyLessons && <>
              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 6 }}>Key Lessons</div>
              {sub.keyLessons.map((l, i) => <div key={i} style={{ padding: '6px 0', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)' }}>• {l}</div>)}
            </>}
            <div className="gold-line" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>Courses Taught</div>
            {allCourses.filter(c => c.instructor === sub.name).map((c, i) => (
              <div key={i} className="card" onClick={() => { navigate('curriculum', { type: 'course', data: c }); }}>
                <span className="badge">{c.code}</span>
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{c.title}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════ ASSESSMENTS ═══════════════════ */}
        {tab === 'assessments' && !activeQuiz && (
          <div className="fade-in">
            <div className="section-title">Assessments</div>
            <div className="section-sub">Quizzes, Midterms & Finals</div>
            {QUIZZES.map(quiz => {
              const prev = progress.quizScores[quiz.id];
              return (
                <div key={quiz.id} className="card" onClick={() => startQuiz(quiz)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="badge">{quiz.courseCode}</span>
                    <span className="badge">{quiz.type}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{quiz.title}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                    {quiz.questions.length} questions · {quiz.timeLimit} minutes
                  </div>
                  {prev && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: prev.score / prev.total >= 0.7 ? 'var(--success)' : 'var(--error)', marginTop: 4 }}>Previous: {prev.score}/{prev.total}</div>}
                </div>
              );
            })}
            <div className="gold-line" />
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10 }}>Essay Prompts</div>
            {ESSAY_PROMPTS.map((ep, i) => (
              <div key={i} className="card static">
                <span className="badge">{ep.courseCode}</span>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 6, marginBottom: 8 }}>{ep.title}</div>
                {ep.prompts.map((p, pi) => (
                  <div key={pi} style={{ padding: '8px 0 8px 12px', borderLeft: '2px solid var(--border)', marginBottom: 8, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p}</div>
                ))}
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)', marginTop: 6 }}>{ep.guidelines}</div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ ACTIVE QUIZ ═══ */}
        {tab === 'assessments' && activeQuiz && (
          <div className="fade-in">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button className="btn-outline" onClick={() => setActiveQuiz(null)}>← Exit</button>
              {quizSubmitted && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: activeQuiz.questions.reduce((a, q, i) => a + (quizAnswers[i] === q.correct ? 1 : 0), 0) / activeQuiz.questions.length >= 0.7 ? 'var(--success)' : 'var(--error)' }}>
                {activeQuiz.questions.reduce((a, q, i) => a + (quizAnswers[i] === q.correct ? 1 : 0), 0)}/{activeQuiz.questions.length}
              </div>}
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)', marginBottom: 20 }}>{activeQuiz.title}</h3>
            {activeQuiz.questions.map((q, qi) => (
              <div key={qi} style={{ marginBottom: 24 }}>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 15, marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gold)', marginRight: 8 }}>{qi + 1}.</span>{q.q}
                </div>
                {q.options.map((opt, oi) => {
                  let cls = 'quiz-option';
                  if (quizAnswers[qi] === oi) cls += ' selected';
                  if (quizSubmitted && oi === q.correct) cls += ' correct';
                  if (quizSubmitted && quizAnswers[qi] === oi && oi !== q.correct) cls += ' incorrect';
                  return <button key={oi} className={cls} onClick={() => !quizSubmitted && setQuizAnswers(p => ({ ...p, [qi]: oi }))}>{opt}</button>;
                })}
                {quizSubmitted && <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 6, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 3 }}>{q.explanation}</div>}
              </div>
            ))}
            {!quizSubmitted && <button className="btn-gold" style={{ width: '100%' }} onClick={submitQuiz}>Submit</button>}
          </div>
        )}

        {/* ═══════════════════ FLASHCARDS ═══════════════════ */}
        {tab === 'flashcards' && (
          <div className="fade-in">
            <div className="section-title">Flashcards</div>
            <div className="section-sub">Tap to flip · Swipe to advance</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 16, textAlign: 'center' }}>
              Card {cardIndex + 1} of {FLASHCARDS.length}
            </div>
            <div className={`flashcard ${cardFlipped ? 'flipped' : ''}`} onClick={() => setCardFlipped(f => !f)}>
              <div className="flashcard-inner">
                <div className="flashcard-front">
                  <div className="badge" style={{ marginBottom: 12 }}>{FLASHCARDS[cardIndex].category}</div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 17, lineHeight: 1.7, textAlign: 'center' }}>{FLASHCARDS[cardIndex].front}</p>
                </div>
                <div className="flashcard-back">
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', whiteSpace: 'pre-line' }}>{FLASHCARDS[cardIndex].back}</p>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 16 }}>
              <button className="btn-outline" onClick={() => { setCardIndex(i => Math.max(0, i - 1)); setCardFlipped(false); }}>← Previous</button>
              <button className="btn-gold" onClick={() => { setCardIndex(i => Math.min(FLASHCARDS.length - 1, i + 1)); setCardFlipped(false); }}>Next →</button>
            </div>
          </div>
        )}

        {/* ═══════════════════ TIMELINE ═══════════════════ */}
        {tab === 'timeline' && (
          <div className="fade-in">
            <div className="section-title">Timeline</div>
            <div className="section-sub">Art History from 36,000 BC to Present</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
              {['all', 'painting', 'sculpture', 'architecture', 'theory', 'market'].map(f => (
                <button key={f} className={`toggle-btn ${timelineFilter === f ? 'active' : ''}`} onClick={() => setTimelineFilter(f)}>{f}</button>
              ))}
            </div>
            {filteredTimeline.map((t, i) => (
              <div key={i} className="timeline-item">
                <div>
                  <div className="timeline-dot" style={{ background: { painting: '#e74c3c', sculpture: '#3498db', architecture: '#2ecc71', theory: '#f39c12', market: '#9b59b6', manuscript: '#e67e22', photography: '#1abc9c', installation: '#e91e63' }[t.category] || 'var(--gold)' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--gold)' }}>{t.year < 0 ? `${Math.abs(t.year).toLocaleString()} BC` : `${t.year} AD`}</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginTop: 2 }}>{t.event}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{t.era}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════ GLOSSARY ═══════════════════ */}
        {tab === 'glossary' && (
          <div className="fade-in">
            <div className="section-title">Glossary</div>
            <div className="section-sub">{GLOSSARY.length} Essential Terms</div>
            <input className="input-dark" placeholder="Search terms or definitions..." value={glossarySearch} onChange={e => setGlossarySearch(e.target.value)} style={{ marginBottom: 20 }} />
            {filteredGlossary.map((g, i) => (
              <div key={i} style={{ padding: '14px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--gold)' }}>{g.term}</div>
                  <span className="badge">{g.category}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginTop: 2, marginBottom: 4 }}>/{g.pronunciation}/</div>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{g.definition}</p>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════ MUSEUMS ═══════════════════ */}
        {tab === 'museums' && (
          <div className="fade-in">
            <div className="section-title">Museum Search</div>
            <div className="section-sub">Search any city worldwide</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.6 }}>
              Planning a trip? Enter any city to discover which museums and galleries to visit, what art you must see, why it's special, how it got there, and what it's worth.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              <input className="input-dark" placeholder="e.g. Baltimore, Tokyo, Florence..." value={museumQuery} onChange={e => setMuseumQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchMuseums()} style={{ flex: 1 }} />
              <button className="btn-gold" onClick={searchMuseums} disabled={museumLoading}>
                {museumLoading ? '...' : 'Search'}
              </button>
            </div>

            {museumLoading && (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>🔍</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Consulting our faculty on museums in {museumQuery}...</div>
              </div>
            )}

            {museumResults === 'error' && (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--error)' }}>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}>Unable to search at this time. Please check your connection and try again.</p>
              </div>
            )}

            {Array.isArray(museumResults) && museumResults.map((museum, mi) => (
              <div key={mi} style={{ marginBottom: 28 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 300, color: 'var(--gold)', minWidth: 30 }}>#{museum.rank || mi + 1}</span>
                  <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--gold)' }}>{museum.museum}</h3>
                </div>
                {museum.address && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{museum.address}</div>}
                {museum.description && <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>{museum.description}</p>}
                <div className="gold-line" style={{ margin: '10px 0' }} />
                {museum.mustSee?.map((work, wi) => (
                  <div key={wi} className="museum-work">
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gold)' }}>{work.work}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{work.artist} · {work.date}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>Why It Matters</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 8 }}>{work.why}</p>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>Estimated Value</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--gold)', marginBottom: 8 }}>{work.value}</p>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 3 }}>Provenance</div>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{work.provenance}</p>
                  </div>
                ))}
              </div>
            ))}

            {!museumResults && !museumLoading && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10 }}>Popular Searches</div>
            )}
            {!museumResults && !museumLoading && ['Paris', 'New York', 'London', 'Florence', 'Tokyo', 'Madrid', 'Amsterdam', 'Berlin', 'Rome', 'Chicago', 'Washington DC', 'Baltimore', 'Los Angeles', 'Mexico City', 'São Paulo'].map(city => (
              <button key={city} className="btn-outline" style={{ margin: '4px 4px' }} onClick={() => { setMuseumQuery(city); setTimeout(searchMuseums, 100); }}>
                {city}
              </button>
            ))}
          </div>
        )}

        {/* ═══════════════════ OFFICE HOURS ═══════════════════ */}
        {tab === 'office' && (
          <div className="fade-in">
            <div className="section-title">Office Hours</div>
            <div className="section-sub">Virtual Faculty Consultation</div>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: 16 }}>
              Ask any question about art history, theory, market practices, curatorial methods, or your coursework. Our faculty will respond with expert insight.
            </p>
            <div style={{ marginBottom: 16, maxHeight: 400, overflowY: 'auto' }}>
              {ohHistory.map((msg, i) => (
                <div key={i} style={{ marginBottom: 10, padding: 14, background: msg.role === 'student' ? 'var(--bg-tertiary)' : 'var(--bg-secondary)', border: `1px solid ${msg.role === 'student' ? 'var(--border)' : 'var(--border-hover)'}`, borderRadius: 4 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: msg.role === 'student' ? 'var(--text-dim)' : 'var(--gold)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
                    {msg.role === 'student' ? 'You' : 'Professor'}
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: msg.role === 'student' ? 'var(--text-secondary)' : 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{msg.text}</p>
                </div>
              ))}
              {ohLoading && <div style={{ textAlign: 'center', padding: 12, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>The professor is composing a response...</div>}
            </div>
            <textarea className="input-dark" placeholder="Ask your question here..." value={ohQuestion} onChange={e => setOhQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); askOfficeHours(); } }} />
            <button className="btn-gold" onClick={askOfficeHours} style={{ marginTop: 10, width: '100%' }} disabled={ohLoading}>Submit Question</button>
          </div>
        )}

        {/* ═══════════════════ PROGRESS ═══════════════════ */}
        {tab === 'progress' && (
          <div className="fade-in">
            <div className="section-title">Progress</div>
            <div className="section-sub">Your Academic Record</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
              {[
                { n: stats.lecturesCompleted, l: 'Lectures Completed' },
                { n: stats.quizzesTaken, l: 'Quizzes Taken' },
                { n: `${stats.averageScore}%`, l: 'Average Score' },
                { n: stats.flashcardsReviewed, l: 'Flashcards Reviewed' },
              ].map((s, i) => (
                <div key={i} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', padding: 16, textAlign: 'center', borderRadius: 4 }}>
                  <div style={{ fontSize: 24, fontWeight: 300, color: 'var(--gold)' }}>{s.n}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 1, color: 'var(--text-dim)', textTransform: 'uppercase', marginTop: 4 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {Object.keys(progress.quizScores).length > 0 && <>
              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10 }}>Quiz History</div>
              {Object.entries(progress.quizScores).map(([id, score]) => {
                const quiz = QUIZZES.find(q => q.id === id);
                return (
                  <div key={id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)' }}>{quiz?.title || id}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: score.score / score.total >= 0.7 ? 'var(--success)' : 'var(--error)' }}>{score.score}/{score.total}</span>
                  </div>
                );
              })}
            </>}

            {progress.completedLectures.length > 0 && <>
              <div className="gold-line" />
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 2, color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 10 }}>Completed Lectures</div>
              {progress.completedLectures.map((lec, i) => (
                <div key={i} style={{ padding: '6px 0', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--success)' }}>✓ {lec}</div>
              ))}
            </>}

            <div className="gold-line" />
            <button className="btn-outline" onClick={() => { if (confirm('Reset all progress? This cannot be undone.')) { resetProgress(); setProgress(getProgress()); } }} style={{ color: 'var(--error)', borderColor: 'var(--error)' }}>
              Reset All Progress
            </button>
          </div>
        )}

      </main>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ textAlign: 'center', padding: '24px 16px', borderTop: '1px solid var(--bg-tertiary)', flexShrink: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: 3, color: 'var(--text-ghost)', textTransform: 'uppercase' }}>
          The Academy · Available Offline · All Rights Reserved
        </div>
      </footer>
    </div>
  );
}
