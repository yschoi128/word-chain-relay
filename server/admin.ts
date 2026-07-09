import { Router } from 'express';
import {
  doAssignTeams,
  doStartRound,
  doEndRound,
  doShowResult,
  doReset,
  restartKeepTeams,
  previewNextQuestion,
  replaceNextQuestion,
  addManualQuestion,
  removeManualQuestion,
  getManualQuestions,
  getTeamRoster,
  doShowFinalResult,
} from './game.js';

const router = Router();

router.post('/assign-teams', (_req, res) => {
  const result = doAssignTeams();
  res.json(result);
});

router.post('/start-round', (_req, res) => {
  const result = doStartRound();
  res.json(result);
});

router.post('/end-round', (_req, res) => {
  const result = doEndRound();
  res.json(result);
});

router.post('/reset', (_req, res) => {
  doReset();
  res.json({ success: true });
});

router.post('/restart-keep-teams', (_req, res) => {
  const result = restartKeepTeams();
  res.json(result);
});

router.post('/show-result', (req, res) => {
  const { view } = req.body as { view: 'chain' | 'scoreboard' };
  doShowResult(view ?? 'chain');
  res.json({ success: true });
});

router.get('/preview-question', (_req, res) => {
  const q = previewNextQuestion();
  res.json({ question: q });
});

router.post('/replace-question', (_req, res) => {
  const q = replaceNextQuestion();
  res.json({ question: q });
});

router.post('/add-question', (req, res) => {
  const { startWord, targetWord } = req.body as { startWord: string; targetWord: string };
  if (!startWord?.trim() || !targetWord?.trim()) {
    res.status(400).json({ success: false, error: '출발어와 목표어를 입력하세요' });
    return;
  }
  addManualQuestion({ startWord: startWord.trim(), targetWord: targetWord.trim() });
  res.json({ success: true, questions: getManualQuestions() });
});

router.post('/remove-question', (req, res) => {
  const { index } = req.body as { index: number };
  removeManualQuestion(index);
  res.json({ success: true, questions: getManualQuestions() });
});

router.get('/manual-questions', (_req, res) => {
  res.json({ questions: getManualQuestions() });
});

router.get('/teams', (_req, res) => {
  res.json({ teams: getTeamRoster() });
});

router.post('/final-result', (_req, res) => {
  const result = doShowFinalResult();
  res.json(result);
});

export default router;
