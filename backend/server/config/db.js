import mongoose from 'mongoose';
import config from './env.js';

/**
 * MongoDB Connection Manager
 * - Retry logic tự động (tối đa 5 lần, backoff 3s → 48s)
 * - Graceful error handling — KHÔNG crash server nếu DB tạm thời unavailable
 * - Connection event monitoring
 * - Heartbeat và timeout tối ưu cho Atlas
 */

/** Trạng thái kết nối hiện tại */
let isConnected = false;
let connectionAttempts = 0;

const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 3000;

/**
 * Kết nối MongoDB với retry logic
 * @returns {Promise<mongoose.Connection|null>} Connection hoặc null nếu thất bại
 */
const connectDB = async () => {
  if (isConnected) {
    console.log('[MongoDB] Đã kết nối trước đó, sử dụng connection hiện tại.');
    return mongoose.connection;
  }

  while (connectionAttempts < MAX_RETRIES) {
    connectionAttempts++;

    try {
      console.log(`[MongoDB] Đang kết nối... (lần ${connectionAttempts}/${MAX_RETRIES})`);

      const conn = await mongoose.connect(config.mongoUri, {
        // Mongoose 8.x tự động xử lý useNewUrlParser, useUnifiedTopology
        serverSelectionTimeoutMS: 10000, // Timeout chọn server: 10 giây
        socketTimeoutMS: 45000,          // Timeout socket: 45 giây
        heartbeatFrequencyMS: 10000,     // Heartbeat mỗi 10 giây
        maxPoolSize: 10,                 // Pool tối đa 10 connections
        minPoolSize: 2,                  // Pool tối thiểu 2 connections
        retryWrites: true,
        w: 'majority',
      });

      isConnected = true;
      connectionAttempts = 0; // Reset counter sau khi thành công

      console.log(`[MongoDB] ✅ Kết nối thành công: ${conn.connection.host}/${conn.connection.name}`);
      return conn.connection;
    } catch (error) {
      const retryDelay = BASE_RETRY_DELAY_MS * Math.pow(2, connectionAttempts - 1);

      console.error(
        `[MongoDB] ❌ Lần ${connectionAttempts}/${MAX_RETRIES} thất bại: ${error.message}`
      );

      if (connectionAttempts < MAX_RETRIES) {
        console.log(`[MongoDB] ⏳ Thử lại sau ${retryDelay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  // Đã hết retry — KHÔNG crash server, chỉ cảnh báo
  console.error(
    `[MongoDB] ⛔ Không thể kết nối sau ${MAX_RETRIES} lần thử.` +
    '\n  → Server vẫn chạy nhưng các tính năng cần DB sẽ không hoạt động.' +
    '\n  → Kiểm tra: MONGODB_URI, IP whitelist trên Atlas, network connectivity.'
  );

  return null;
};

/**
 * Đăng ký event listeners cho MongoDB connection
 */
const setupConnectionEvents = () => {
  mongoose.connection.on('connected', () => {
    isConnected = true;
    console.log('[MongoDB] 🟢 Event: connected');
  });

  mongoose.connection.on('disconnected', () => {
    isConnected = false;
    console.log('[MongoDB] 🔴 Event: disconnected');
  });

  mongoose.connection.on('error', (err) => {
    isConnected = false;
    console.error('[MongoDB] 🟡 Event: error —', err.message);
  });

  // Reconnect tự động khi mất kết nối
  mongoose.connection.on('disconnected', () => {
    if (connectionAttempts === 0) {
      console.log('[MongoDB] 🔄 Đang thử kết nối lại...');
      setTimeout(() => {
        connectionAttempts = 0;
        connectDB().catch(() => {});
      }, 5000);
    }
  });
};

// Đăng ký events ngay khi module load
setupConnectionEvents();

/**
 * Ngắt kết nối MongoDB (dùng khi graceful shutdown)
 */
const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[MongoDB] 🔌 Đã ngắt kết nối.');
  }
};

/**
 * Kiểm tra trạng thái kết nối
 * @returns {{ connected: boolean, readyState: number, host: string }}
 */
const getDBStatus = () => {
  const conn = mongoose.connection;
  return {
    connected: isConnected && conn.readyState === 1,
    readyState: conn.readyState,
    readyStateText: ['disconnected', 'connected', 'connecting', 'disconnecting'][conn.readyState] || 'unknown',
    host: conn.host || 'N/A',
    name: conn.name || 'N/A',
  };
};

export default connectDB;
export { disconnectDB, getDBStatus };
