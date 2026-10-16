/**
 * NEUROVAULT — Real-time Collaboration Server
 * WebSocket server cho live quiz, presence, và real-time events.
 *
 * Features:
 * - Room-based architecture (mỗi document = 1 room)
 * - User presence tracking (ai đang online trong room)
 * - Live Quiz: host tạo quiz, participants join + answer real-time
 * - Cursor/activity broadcasting
 * - JWT authentication on connect
 */

import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import config from './config/env.js';
import { v4 as uuidv4 } from 'uuid';

// ══════════════════════════════════════════════
// DATA STORES (in-memory — production would use Redis)
// ══════════════════════════════════════════════

/** @type {Map<string, Map<string, object>>} roomId → Map<clientId, clientInfo> */
const rooms = new Map();

/** @type {Map<string, object>} liveQuizId → quizState */
const liveQuizzes = new Map();

/** @type {Map<WebSocket, object>} ws → clientMeta */
const clients = new Map();

// ══════════════════════════════════════════════
// SETUP
// ══════════════════════════════════════════════

export function setupCollaborationWS(httpServer) {
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws/collab',
    maxPayload: 64 * 1024, // 64KB max message
  });

  console.log('[Collab-WS] WebSocket server attached at /ws/collab');

  wss.on('connection', (ws, req) => {
    const clientId = uuidv4().slice(0, 8);

    // Parse token from query string
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    let user = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret);
        user = { id: decoded.userId, name: decoded.name || 'User' };
      } catch {
        // Anonymous connection allowed for spectators
      }
    }

    const clientMeta = {
      id: clientId,
      user,
      ws,
      room: null,
      joinedAt: Date.now(),
    };
    clients.set(ws, clientMeta);

    // Send welcome
    send(ws, { type: 'connected', clientId, userId: user?.id || null });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        handleMessage(ws, clientMeta, msg);
      } catch {
        send(ws, { type: 'error', message: 'Invalid JSON' });
      }
    });

    ws.on('close', () => {
      handleDisconnect(ws, clientMeta);
      clients.delete(ws);
    });

    ws.on('error', () => {
      handleDisconnect(ws, clientMeta);
      clients.delete(ws);
    });
  });

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.readyState === ws.OPEN) {
        send(ws, { type: 'ping', t: Date.now() });
      }
    });
  }, 30000);

  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}

// ══════════════════════════════════════════════
// MESSAGE HANDLER
// ══════════════════════════════════════════════

function handleMessage(ws, client, msg) {
  switch (msg.type) {
    case 'join_room':
      handleJoinRoom(ws, client, msg);
      break;
    case 'leave_room':
      handleLeaveRoom(ws, client);
      break;
    case 'cursor_move':
      broadcastToRoom(client.room, { type: 'cursor_move', clientId: client.id, userName: client.user?.name, position: msg.position }, ws);
      break;
    case 'activity':
      broadcastToRoom(client.room, { type: 'activity', clientId: client.id, userName: client.user?.name, action: msg.action }, ws);
      break;

    // Live Quiz
    case 'quiz_create':
      handleQuizCreate(ws, client, msg);
      break;
    case 'quiz_join':
      handleQuizJoin(ws, client, msg);
      break;
    case 'quiz_start':
      handleQuizStart(ws, client, msg);
      break;
    case 'quiz_answer':
      handleQuizAnswer(ws, client, msg);
      break;
    case 'quiz_next':
      handleQuizNext(ws, client, msg);
      break;
    case 'quiz_end':
      handleQuizEnd(ws, client, msg);
      break;

    case 'pong':
      break; // Heartbeat response

    default:
      send(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
  }
}

// ══════════════════════════════════════════════
// ROOM MANAGEMENT
// ══════════════════════════════════════════════

function handleJoinRoom(ws, client, msg) {
  const roomId = msg.roomId;
  if (!roomId) return send(ws, { type: 'error', message: 'roomId required' });

  // Leave current room first
  if (client.room) handleLeaveRoom(ws, client);

  // Join new room
  if (!rooms.has(roomId)) rooms.set(roomId, new Map());
  const room = rooms.get(roomId);

  const memberInfo = {
    clientId: client.id,
    userId: client.user?.id,
    name: client.user?.name || `Guest-${client.id}`,
    joinedAt: Date.now(),
  };
  room.set(client.id, memberInfo);
  client.room = roomId;

  // Send room state to joiner
  const members = Array.from(room.values());
  send(ws, { type: 'room_joined', roomId, members, yourId: client.id });

  // Broadcast to others
  broadcastToRoom(roomId, { type: 'member_joined', member: memberInfo, memberCount: members.length }, ws);
}

function handleLeaveRoom(ws, client) {
  if (!client.room) return;
  const roomId = client.room;
  const room = rooms.get(roomId);

  if (room) {
    room.delete(client.id);
    broadcastToRoom(roomId, { type: 'member_left', clientId: client.id, memberCount: room.size });
    if (room.size === 0) rooms.delete(roomId);
  }
  client.room = null;
}

function handleDisconnect(ws, client) {
  handleLeaveRoom(ws, client);

  // Clean up any live quizzes this client was hosting
  for (const [quizId, quiz] of liveQuizzes.entries()) {
    if (quiz.hostId === client.id) {
      broadcastToRoom(quiz.roomId, { type: 'quiz_ended', quizId, reason: 'host_disconnected' });
      liveQuizzes.delete(quizId);
    }
  }
}

// ══════════════════════════════════════════════
// LIVE QUIZ
// ══════════════════════════════════════════════

function handleQuizCreate(ws, client, msg) {
  if (!client.user) return send(ws, { type: 'error', message: 'Authentication required to host quiz' });
  if (!msg.questions?.length) return send(ws, { type: 'error', message: 'questions required' });

  const quizId = uuidv4().slice(0, 6).toUpperCase();
  const quiz = {
    quizId,
    hostId: client.id,
    hostName: client.user.name,
    roomId: client.room || `quiz-${quizId}`,
    questions: msg.questions.map((q, i) => ({
      index: i,
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      timeLimit: q.timeLimit || 30,
    })),
    participants: new Map(),
    currentQuestion: -1,
    status: 'waiting', // waiting → active → finished
    createdAt: Date.now(),
  };

  liveQuizzes.set(quizId, quiz);

  // Auto-join host to quiz room
  if (!client.room) {
    handleJoinRoom(ws, client, { roomId: quiz.roomId });
  }

  send(ws, { type: 'quiz_created', quizId, questionCount: quiz.questions.length, roomId: quiz.roomId });
  broadcastToRoom(quiz.roomId, { type: 'quiz_available', quizId, hostName: quiz.hostName, questionCount: quiz.questions.length }, ws);
}

function handleQuizJoin(ws, client, msg) {
  const quiz = liveQuizzes.get(msg.quizId);
  if (!quiz) return send(ws, { type: 'error', message: 'Quiz not found' });
  if (quiz.status === 'finished') return send(ws, { type: 'error', message: 'Quiz already finished' });

  const name = client.user?.name || `Guest-${client.id}`;
  quiz.participants.set(client.id, { clientId: client.id, name, score: 0, answers: [] });

  // Join quiz room
  if (client.room !== quiz.roomId) {
    handleJoinRoom(ws, client, { roomId: quiz.roomId });
  }

  send(ws, { type: 'quiz_joined', quizId: quiz.quizId, status: quiz.status, questionCount: quiz.questions.length });
  broadcastToRoom(quiz.roomId, {
    type: 'quiz_participant_joined', quizId: quiz.quizId, participant: name,
    participantCount: quiz.participants.size,
  });
}

function handleQuizStart(ws, client, msg) {
  const quiz = liveQuizzes.get(msg.quizId);
  if (!quiz) return send(ws, { type: 'error', message: 'Quiz not found' });
  if (quiz.hostId !== client.id) return send(ws, { type: 'error', message: 'Only host can start' });

  quiz.status = 'active';
  quiz.currentQuestion = 0;
  const q = quiz.questions[0];

  broadcastToRoom(quiz.roomId, {
    type: 'quiz_question',
    quizId: quiz.quizId,
    questionIndex: 0,
    totalQuestions: quiz.questions.length,
    question: q.question,
    options: q.options,
    timeLimit: q.timeLimit,
  });
}

function handleQuizAnswer(ws, client, msg) {
  const quiz = liveQuizzes.get(msg.quizId);
  if (!quiz || quiz.status !== 'active') return;

  const participant = quiz.participants.get(client.id);
  if (!participant) return;

  const q = quiz.questions[quiz.currentQuestion];
  if (!q) return;

  const isCorrect = msg.answerIndex === q.correctIndex;
  // Score: base 100 + speed bonus (max 50)
  const timeTaken = Math.min(msg.timeTaken || q.timeLimit, q.timeLimit);
  const speedBonus = Math.round((1 - timeTaken / q.timeLimit) * 50);
  const points = isCorrect ? 100 + speedBonus : 0;

  participant.score += points;
  participant.answers.push({
    questionIndex: quiz.currentQuestion,
    answerIndex: msg.answerIndex,
    isCorrect,
    points,
    timeTaken,
  });

  // Notify host
  const hostWs = findClientWs(quiz.hostId);
  if (hostWs) {
    send(hostWs, {
      type: 'quiz_answer_received',
      quizId: quiz.quizId,
      participantName: participant.name,
      answeredCount: Array.from(quiz.participants.values()).filter(p => p.answers.length > quiz.currentQuestion).length,
      totalParticipants: quiz.participants.size,
    });
  }

  // Notify answerer
  send(ws, { type: 'quiz_answer_result', isCorrect, points, totalScore: participant.score, correctIndex: q.correctIndex });
}

function handleQuizNext(ws, client, msg) {
  const quiz = liveQuizzes.get(msg.quizId);
  if (!quiz || quiz.hostId !== client.id) return;

  quiz.currentQuestion++;
  if (quiz.currentQuestion >= quiz.questions.length) {
    return handleQuizEnd(ws, client, msg);
  }

  const q = quiz.questions[quiz.currentQuestion];

  // Send leaderboard update
  const leaderboard = getLeaderboard(quiz);

  broadcastToRoom(quiz.roomId, {
    type: 'quiz_question',
    quizId: quiz.quizId,
    questionIndex: quiz.currentQuestion,
    totalQuestions: quiz.questions.length,
    question: q.question,
    options: q.options,
    timeLimit: q.timeLimit,
    leaderboard,
  });
}

function handleQuizEnd(ws, client, msg) {
  const quiz = liveQuizzes.get(msg.quizId);
  if (!quiz) return;
  if (quiz.hostId !== client.id) return;

  quiz.status = 'finished';
  const leaderboard = getLeaderboard(quiz);

  broadcastToRoom(quiz.roomId, {
    type: 'quiz_finished',
    quizId: quiz.quizId,
    leaderboard,
    totalQuestions: quiz.questions.length,
  });

  // Cleanup after 60s
  setTimeout(() => liveQuizzes.delete(quiz.quizId), 60000);
}

// ══════════════════════════════════════════════
// UTILITIES
// ══════════════════════════════════════════════

function send(ws, data) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId, data, excludeWs = null) {
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  const msg = JSON.stringify(data);
  for (const [, member] of room) {
    const memberWs = findClientWsByClientId(member.clientId);
    if (memberWs && memberWs !== excludeWs && memberWs.readyState === memberWs.OPEN) {
      memberWs.send(msg);
    }
  }
}

function findClientWs(clientId) {
  for (const [ws, meta] of clients) {
    if (meta.id === clientId) return ws;
  }
  return null;
}

function findClientWsByClientId(clientId) {
  return findClientWs(clientId);
}

function getLeaderboard(quiz) {
  return Array.from(quiz.participants.values())
    .map(p => ({ name: p.name, score: p.score, answeredCount: p.answers.length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// Stats export
export function getCollabStats() {
  return {
    activeRooms: rooms.size,
    totalClients: clients.size,
    activeQuizzes: liveQuizzes.size,
    rooms: Array.from(rooms.entries()).map(([id, members]) => ({
      roomId: id, memberCount: members.size,
    })),
  };
}
