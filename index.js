// 引入 Node.js 核心模块和第三方依赖
const WebSocket = require('ws');
const fetch = require('node-fetch');
const fs = require('fs-extra');
const path = require('path');

// 模拟浏览器的 localStorage（使用文件存储）
class LocalStorageMock {
    constructor(storagePath = './storage.json') {
        this.storagePath = storagePath;
        this.data = {};
        // 加载已有数据
        try {
            if (fs.existsSync(this.storagePath)) {
                this.data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            }
        } catch (err) {
            this.data = {};
        }
    }

    getItem(key) {
        return this.data[key] || null;
    }

    setItem(key, value) {
        this.data[key] = value;
        // 持久化到文件
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage lưu thất bại]', err);
        }
    }

    removeItem(key) {
        delete this.data[key];
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage xóa thất bại]', err);
        }
    }

    clear() {
        this.data = {};
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.data, null, 2), 'utf8');
        } catch (err) {
            console.error('[LocalStorage xóa hết thất bại]', err);
        }
    }
}

// 全局挂载模拟的 localStorage
const localStorage = new LocalStorageMock();

// 配置项（删除原adminPrefix，仅保留必要配置）
const CONFIG = {
    server: "wss://hack.chat/chat-ws", // 官方WS地址，禁止修改
    channel: "p", // 机器人频道
    botName: "oreactko_bot",
    debug: false, // 调试模式
    // 颜色配置
    color: {
        enable: true, // 是否启用颜色设置
        hex: "#5ee6ed" // 16进制颜色值（必须以#开头）
    },
    // 通用常量
    CONST: {
        ADMIN_TRIPCODE: '+pcAwQ', // 管理员专属tripcode
        cmdPrefix: '!', // 命令前缀
        sendRateLimit: 200, // 防限流发送间隔（ms）
        muteCheckInterval: 10000, // 禁言检查间隔10秒
        maxMsgHistory: 5000, // 本地消息最大存储量
        latestMsgCount: 5, // 最新消息展示数
        welcomeMsg: "Chào mừng %s tham gia! Gửi `!help` để xem lệnh",
        emojiList: ['😀', '😂', '🤣', '😊', '👍', '🎉', '🎁', '🌟', '🚀', '💡', '📚', '🎲', '☁️', '⚡', '❤️'],
        // 模仿风格模板
        styleTemplates: {
            questionReplies: [
                'Tôi cũng rất bối rối', 'Câu hỏi này làm tôi ngỡ ngàng', 'Tương cảm, ai giải thích được không', '?',
                'Tôi chỉ là một robot nhỏ, cũng rất bối rối', '？', 'Đây... Tôi cần tra cứu bách khoa nhỏ của mình'
            ],
            exclaimReplies: [
                'Hehe, quá tuyệt vời nhỉ', 'Wow, hay đấy', 'Haha, lượt này tôi cho 10 điểm'
            ],
            greetingReplies: [
                'Chào mọi người ạ～', 'Đây rồi, có gì gọi tôi', 'Chào bạn, hôm nay cũng cố gắng nhé'
            ],
            smallTalkReplies: [
                'Uhm~', 'Oh oh', 'Đã hiểu rồi'
            ]
        },
        // 周期发布池设置
        periodic: {
            includeYiyan: true,
            includeStyle: true,
            includeTriviaAuto: false
        }
    }
};

// 命令配置
const CMD_CONFIG = {
    // 公共命令
    help: { trigger: ['help', 'h'], desc: 'Xem tất cả lệnh có sẵn', auth: false, public: true, params: '' },
    roll: { trigger: ['roll'], desc: 'Đổ xúc xắc, hỗ trợ !roll 1-100 tùy chỉnh phạm vi', auth: false, public: true, params: '[phạm vi(tùy chọn)]' },
    afk: { trigger: ['afk'], desc: 'Đặt/hủy trạng thái rời khỏi (AFK)', auth: false, public: true, params: '' },
    online: { trigger: ['online'], desc: 'Xem tất cả người dùng đang online trong kênh', auth: false, public: true, params: '' },
    msglist: { trigger: ['msglist'], desc: 'Xem 5 ID tin nhắn mới nhất (dùng cho !reply)', auth: false, public: true, params: '' },
    reply: { trigger: ['reply'], desc: 'Trả lời trích dẫn tin nhắn lịch sử', auth: false, public: true, params: '[ID tin nhắn] [nội dung trả lời]' },
    userinfo: { trigger: ['userinfo'], desc: 'Tra cứu thông tin người dùng', auth: false, public: true, params: '[tên người dùng(tùy chọn)]' },
    stats: { trigger: ['stats'], desc: 'Xem TOP3 độ hoạt động kênh + số người online', auth: false, public: true, params: '' },
    save: { trigger: ['save'], desc: 'Xuất lịch sử chat local thành file JSON', auth: false, public: true, params: '' },
    clear: { trigger: ['clear'], desc: 'Xóa hết lịch sử tin nhắn local của robot', auth: false, public: true, params: '' },
    calc: { trigger: ['calc', 'tinh'], desc: 'Máy tính đơn giản, hỗ trợ +/*/-/()', auth: false, public: true, params: '[biểu thức tính toán]' },
    weather: { trigger: ['weather', 'thoitiet'], desc: 'Tra cứu thời tiết đơn giản của thành phố', auth: false, public: true, params: '[tên thành phố]' },
    emoji: { trigger: ['emoji', 'bieu tinh'], desc: 'Gửi biểu tượng cảm xúc ngẫu nhiên', auth: false, public: true, params: '' },
    yiyan: { trigger: ['yiyan', 'nghiyan'], desc: 'Lấy ngẫu nhiên một câu nói (từ hitokoto)', auth: false, public: true, params: '' },
    // 管理员命令
    specialHelp: { trigger: ['helpadmin'], desc: 'Xem lệnh dành riêng cho quản trị viên', auth: false, public: false, params: '' },
    mute: { trigger: ['mute'], desc: 'Cấm nói tạm thời người dùng', auth: true, public: false, params: '[tên người dùng] [số phút]' },
    silence: { trigger: ['silence'], desc: 'Cấm nói vĩnh viễn người dùng', auth: true, public: false, params: '[tên người dùng]' },
    unsilence: { trigger: ['unsilence'], desc: 'Bỏ cấm nói người dùng', auth: true, public: false, params: '[tên người dùng]' },
    con: { trigger: ['con'], desc: 'Robot xuất trực tiếp nội dung văn bản thuần', auth: true, public: false, params: '[bất kỳ văn bản nào]' },
    announce: { trigger: ['announce'], desc: 'Gửi thông báo nổi bật kênh', auth: true, public: false, params: '[nội dung thông báo]' },
    pann: { trigger: ['pann'], desc: 'Quản lý thông báo định kỳ: pann add|remove|list|clear', auth: true, public: false, params: '[lệnh con]' },
    if: { trigger: ['if'], desc: 'Quản lý quy tắc trả lời tự động: if add A B N|list|remove|clear', auth: true, public: false, params: '[lệnh con]' },
    talk: { trigger: ['talk'], desc: 'Kiểm soát trạng thái nói của robot: !talk on|off', auth: true, public: false, params: '[on/off]' },
    stop: { trigger: ['stop'], desc: 'Dừng robot và thoát', auth: true, public: false, params: '' }
};

const bot = {
    // 运行时数据
    ws: null,
    clientId: Math.random().toString(36).slice(2, 10),
    lastSendTime: 0,
    afkUsers: new Map(),
    silencedUsers: new Map(),
    messageHistory: [],
    userActivity: new Map(),
    messageIdMap: new Map(),
    nextMessageId: 1,
    scheduledIntervals: [],
    cmdMap: new Map(),
    onlineUsers: new Set(),
    lastQuestionReplyTime: 0,
    lastHourlyAnnouncement: null,
    recentMsgTimestamps: [],
    periodicTimeoutId: null,
    scheduledAnnouncements: [], // 结构：[{content: '', interval: number, lastSendTime: 0}]
    lastPeriodicSentId: null,
    stopped: false,
    ifRules: [], // 自动回复规则：[{trigger: '', reply: '', probability: number, id: number, isRegex?: boolean}]
    ifTimer: null, // A为空的规则定时器
    isMuted: false, // 是否闭嘴（核心状态：true=仅响应!talk on，false=正常）

    // 初始化入口
    init() {
        this.initCmdMap();
        this.loadIfRules(); // 加载if规则
        this.connectWS();
        this.startTimers();
        console.log(`[✅ ${CONFIG.botName}] Robot khởi động | Trạng thái nói ban đầu: Bình thường`);
    },

    // 初始化命令映射
    initCmdMap() {
        const { cmdPrefix } = CONFIG.CONST;
        Object.entries(CMD_CONFIG).forEach(([cmdKey, config]) => {
            config.trigger.forEach(trigger => {
                const fullTrigger = `${cmdPrefix}${trigger}`;
                this.cmdMap.set(fullTrigger, {
                    key: cmdKey,
                    ...config,
                    handler: this[`handle${cmdKey.charAt(0).toUpperCase() + cmdKey.slice(1)}`]
                });
            });
        });
    },

    // 连接WS服务器（Node.js版本）
    connectWS() {
        if (this.ws) this.ws.close(1000, 'reconnect');
        
        // 创建Node.js的WebSocket客户端
        this.ws = new WebSocket(CONFIG.server);

        this.ws.on('open', () => {
            console.log(`[Kết nối thành công] Kênh: ${CONFIG.channel}`);
            this.joinChannel();
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                CONFIG.debug && console.log(`[Nhận]`, msg);
                this.handleOfficialCommands(msg);
            } catch (err) {
                console.error(`[Phân tích thất bại]`, err);
            }
        });

        this.ws.on('close', () => {
            console.log(`[Kết nối đóng]`);
            this.onlineUsers.clear();
            if (!this.stopped) {
                console.log(`Kết nối lại sau 5 giây`);
                setTimeout(() => this.connectWS(), 5000);
            } else {
                console.log(`[${CONFIG.botName}] Trạng thái dừng, không kết nối lại nữa`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`[Lỗi WS]`, err);
        });
    },

    // 加入频道（仅初始化时发送，不受闭嘴状态影响）
    joinChannel() {
        if (this.ws.readyState !== WebSocket.OPEN) return;
        this.sendWSMessage({
            cmd: 'join',
            channel: CONFIG.channel,
            nick: CONFIG.botName,
            clientId: this.clientId
        }, true, true); // 忽略限流+强制发送（仅加入频道）
        // 发送颜色设置指令
        this.sendColorCommand();
    },

    // 发送颜色设置指令（仅初始化时强制发送）
    sendColorCommand() {
        // 校验配置是否启用且颜色格式合法
        if (!CONFIG.color?.enable) return;
        const colorHex = CONFIG.color.hex?.trim() || '';
        // 验证16进制颜色格式（#开头 + 6位/3位16进制字符）
        const colorReg = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
        if (!colorReg.test(colorHex)) {
            console.error(`[Cấu hình màu lỗi] Giá trị màu hex không hợp lệ: ${colorHex}`);
            return;
        }
        
        // 发送/color指令（仅初始化时强制发送）
        this.sendWSMessage({
            cmd: 'chat',
            text: `/color ${colorHex}`,
            clientId: this.clientId
        }, true, true); // 忽略限流+强制发送
        CONFIG.debug && console.log(`[Đặt màu] Đã gửi: /color ${colorHex}`);
    },

    // 处理所有官方指令
    handleOfficialCommands(msg) {
        switch (msg.cmd) {
            case 'chat':
                this.recordMessage(msg);
                // 闭嘴状态下，仅处理!talk on命令，其他都跳过
                if (this.isMuted) {
                    const text = msg.text.trim();
                    if (text === '!talk on') {
                        this.handleCommands(msg, text);
                    }
                    return; // 直接返回，不处理其他逻辑
                }
                // 非闭嘴状态，正常处理
                if (!this.isSilenced(msg.nick)) {
                    this.handleChatMessage(msg);
                    this.checkIfRules(msg.text); // 检查if规则匹配
                } else {
                    const remain = Math.ceil((this.silencedUsers.get(msg.nick) - Date.now()) / 60000);
                    this.sendChat(`${msg.nick} đang bị cấm nói, còn ${Math.max(remain, 0)} phút`);
                }
                break;
            case 'error':
                // 闭嘴状态下，不处理错误提示
                if (!this.isMuted) {
                    this.handleServerError(msg);
                }
                break;
            case 'onlineSet':
                this.updateOnlineUsers(msg.nicks);
                break;
            case 'onlineAdd':
                this.onlineUsers.add(msg.nick);
                // 闭嘴状态下，不发送欢迎消息
                if (!this.isMuted) {
                    this.sendWelcomeMessage(msg.nick);
                }
                CONFIG.debug && console.log(`[Người dùng mới] ${msg.nick} tham gia`);
                break;
            case 'onlineRemove':
                this.onlineUsers.delete(msg.nick);
                this.afkUsers.delete(msg.nick);
                break;
            default:
                CONFIG.debug && console.log(`[Lệnh chưa xử lý]`, msg.cmd);
        }
    },

    // 新用户欢迎（受闭嘴状态控制）
    sendWelcomeMessage(nick) {
        if (nick === CONFIG.botName || this.isMuted) return;
        const welcomeText = CONFIG.CONST.welcomeMsg.replace('%s', nick);
        this.sendChat(welcomeText);
    },

    // 处理群聊消息
    handleChatMessage(msg) {
        if (msg.nick === CONFIG.botName) return;
        const text = msg.text.trim();
        if (!text) return;
        this.handleCommands(msg, text);
        this.handleAFKMention(msg);
        this.updateUserActivity(msg.nick);

        // 问号回复逻辑（概率15%，受闭嘴状态控制）
        try {
            if (this.isMuted) return; // 闭嘴状态不回复
            if (!text.startsWith(CONFIG.CONST.cmdPrefix) && /[？?]/.test(text)) {
                const now = Date.now();
                const isJustQuestion = /^[？?]+$/.test(text);
                if (isJustQuestion || !this.lastQuestionReplyTime || now - this.lastQuestionReplyTime > 5000) {
                    // 15%概率回复
                    const randomNum = Math.random();
                    if (randomNum <= 0.15) {
                        const reply = this.pickStyleReply('questionReplies');
                        this.sendChat(reply);
                        this.lastQuestionReplyTime = now;
                    }
                }
            }
        } catch (e) { console.error('[Xử lý câu hỏi lỗi]', e); }
    },

    // 检查if规则匹配（新增正则模式支持）
    checkIfRules(text) {
        if (this.isMuted || !this.ifRules.length) return;
        const trimText = text.trim();
        this.ifRules.forEach(rule => {
            let isMatch = false;
            // 判断是否为正则模式
            if (rule.isRegex) {
                try {
                    // 构建正则表达式，忽略大小写
                    const regex = new RegExp(rule.trigger, 'i');
                    isMatch = regex.test(trimText);
                } catch (e) {
                    console.error('[Khớp regex thất bại]', e);
                    isMatch = false;
                }
            } else {
                // 原有完全匹配逻辑
                isMatch = trimText === rule.trigger;
            }

            if (isMatch) {
                // 按概率发送回复
                const randomNum = Math.random();
                if (randomNum <= rule.probability / 100) {
                    this.sendChat(rule.reply);
                }
            }
        });
    },

    // 加载if规则
    loadIfRules() {
        try {
            const key = `bot_${CONFIG.botName}_ifRules`;
            const raw = localStorage.getItem(key);
            this.ifRules = raw ? JSON.parse(raw) : [];
        } catch (e) {
            this.ifRules = [];
        }
    },

    // 保存if规则
    saveIfRules() {
        try {
            const key = `bot_${CONFIG.botName}_ifRules`;
            localStorage.setItem(key, JSON.stringify(this.ifRules || []));
        } catch (e) {}
    },

    // 运行A为空的if规则定时器（受闭嘴状态控制）
    runEmptyIfTimer() {
        if (this.ifTimer) clearInterval(this.ifTimer);
        this.ifTimer = setInterval(() => {
            if (this.isMuted) return; // 闭嘴状态不执行
            this.ifRules.forEach(rule => {
                if (!rule.trigger || rule.trigger.trim() === '') {
                    const randomNum = Math.random();
                    if (randomNum <= rule.probability / 100) {
                        this.sendChat(rule.reply);
                    }
                }
            });
        }, 10000); // 每10秒检查一次
    },

    // 记录消息
    recordMessage(msg) {
        if (msg.cmd !== 'chat' || msg.nick === CONFIG.botName) return;
        const msgObj = {
            id: this.nextMessageId++,
            nick: msg.nick,
            trip: msg.trip || '', // 记录用户的tripcode
            text: msg.text,
            time: new Date().toISOString()
        };
        this.messageHistory.push(msgObj);
        this.messageIdMap.set(msgObj.id, msgObj);

        // 记录最近消息时间戳
        this.recentMsgTimestamps = this.recentMsgTimestamps || [];
        this.recentMsgTimestamps.push(Date.now());
        const MAX_TS = 500;
        if (this.recentMsgTimestamps.length > MAX_TS) {
            this.recentMsgTimestamps.splice(0, this.recentMsgTimestamps.length - MAX_TS);
        }

        if (this.messageHistory.length > CONFIG.CONST.maxMsgHistory) {
            const delMsg = this.messageHistory.shift();
            this.messageIdMap.delete(delMsg.id);
        }
    },

    // 命令处理（核心修改：闭嘴状态下仅响应!talk on）
    handleCommands(msg, text) {
        const [cmdTrigger, ...params] = text.split(/\s+/);
        const cmdItem = this.cmdMap.get(cmdTrigger);
        
        // 闭嘴状态下，仅处理!talk on命令
        if (this.isMuted) {
            if (cmdTrigger === '!talk' && params[0]?.toLowerCase() === 'on') {
                // 仅允许!talk on突破闭嘴状态
                this.handleTalk(msg, params);
            }
            return; // 其他命令全部跳过
        }

        if (!cmdItem) return;

        try {
            // 核心修改：管理员权限判断改为校验tripcode
            if (cmdItem.auth && !this.hasAdminAuth(msg)) {
                this.sendChat(`Không có quyền, chỉ quản trị viên với tripcode 2UE++I mới có thể thực hiện`);
                return;
            }
            if (cmdItem.params && params.length === 0 && cmdTrigger !== '!help s') {
                this.sendChat(`Định dạng sai, đúng: ${cmdTrigger} ${cmdItem.params}`);
                return;
            }
            cmdItem.handler.call(this, msg, params);
        } catch (err) {
            console.error(`[Lệnh thất bại] ${cmdTrigger}`, err);
            this.sendChat(`Thực hiện lỗi: ${err.message.slice(0, 20)}`);
        }
    },

    // 发送WS消息（防限流，闭嘴状态下仅!talk on可发送）
    sendWSMessage(data, ignoreLimit = false, ignoreMute = false) {
        if (this.ws.readyState !== WebSocket.OPEN) {
            console.error(`[Gửi thất bại] Kết nối chưa được thiết lập`);
            return;
        }
        // 闭嘴状态下，仅!talk on的回复可发送
        if (this.isMuted && !ignoreMute) {
            CONFIG.debug && console.log(`[Bỏ qua gửi] Robot đang trong trạng thái im lặng`);
            return;
        }
        const now = Date.now();
        if (!ignoreLimit && now - this.lastSendTime < CONFIG.CONST.sendRateLimit) {
            console.warn(`[Hạn chế tốc độ] Tần suất quá cao`);
            return;
        }
        this.ws.send(JSON.stringify(data));
        this.lastSendTime = now;
    },

    // 发送聊天消息（封装）
    sendChat(text, ignoreMute = false) {
        this.sendWSMessage({
            cmd: 'chat',
            text: text,
            clientId: this.clientId
        }, false, ignoreMute);
        CONFIG.debug && console.log(`[Gửi] ${text} ${ignoreMute ? '(Gửi buộc)' : ''}`);
    },

    // 调试日志
    debugLog(...args) {
        if (CONFIG.debug) console.log(...args);
    },

    // 核心修改：管理员权限判断（仅tripcode为2UE++I的用户）
    hasAdminAuth(msg) {
        // 校验消息中的tripcode是否等于管理员专属tripcode
        return msg.trip === CONFIG.CONST.ADMIN_TRIPCODE;
    },

    // 禁言判断
    isSilenced(nick) {
        if (!this.silencedUsers.has(nick)) return false;
        const expire = this.silencedUsers.get(nick);
        if (expire === Infinity) return true;
        if (expire > Date.now()) return true;
        this.silencedUsers.delete(nick);
        return false;
    },

    // 更新活跃度
    updateUserActivity(nick) {
        this.userActivity.set(nick, (this.userActivity.get(nick) || 0) + 1);
    },

    // AFK@提醒（受闭嘴状态控制）
    handleAFKMention(msg) {
        if (this.isMuted) return;
        const mentionReg = /@(\w+)/g;
        let match;
        while ((match = mentionReg.exec(msg.text)) !== null) {
            const user = match[1];
            if (this.afkUsers.has(user)) {
                const afkMs = Date.now() - this.afkUsers.get(user);
                const afkStr = afkMs > 3600000 ? `${(afkMs / 3600000).toFixed(1)}h` : `${Math.floor(afkMs / 60000)}m`;
                this.sendChat(`@${msg.nick}：${user} AFK(${afkStr})`);
            }
        }
    },

    // 服务端错误处理（受闭嘴状态控制）
    handleServerError(msg) {
        const errorMap = {
            'nicknameTaken': 'Biệt danh đã được sử dụng, vui lòng sửa botName',
            'channelInvalid': 'Kênh không hợp lệ',
            'banned': 'Đã bị cấm bởi hệ thống',
            'rateLimited': 'Tần suất gửi quá cao'
        };
        const text = errorMap[msg.error] || `Lỗi server：${msg.error}`;
        console.error(`[Lỗi server]`, text);
        this.sendChat(text);
    },

    // 更新在线用户
    updateOnlineUsers(nicks) {
        this.onlineUsers = new Set(nicks);
        CONFIG.debug && console.log(`[Người dùng online] Tổng ${this.onlineUsers.size} người`, [...this.onlineUsers]);
    },

    // 启动定时器
    startTimers() {
        // 禁言检查
        const muteId = setInterval(() => this.checkMuteExpire(), CONFIG.CONST.muteCheckInterval);
        this.scheduledIntervals.push(muteId);
        this.debugLog(`[Bộ hẹn giờ khởi động] Kiểm tra cấm nói`);

        // 每小时整点提醒（修复版，受闭嘴状态控制）
        this.lastHourlyAnnouncement = -1;
        const hourlyId = setInterval(() => {
            try {
                if (this.isMuted) return; // 闭嘴状态不提醒
                const now = new Date();
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentSecond = now.getSeconds();
                
                // 整点后10秒内触发，避免重复
                if (currentMinute === 0 && currentSecond >= 0 && currentSecond <= 10) {
                    if (this.lastHourlyAnnouncement !== currentHour) {
                        this.sendChat(`${currentHour} giờ rồi, hãy uống một ngụm nước nhé`);
                        this.lastHourlyAnnouncement = currentHour;
                    }
                } else if (currentMinute > 0) {
                    this.lastHourlyAnnouncement = -1; // 重置标记
                }
            } catch (e) { console.error('[Lỗi nhắc mỗi giờ]', e); }
        }, 1000); // 每秒检查，确保不遗漏
        this.scheduledIntervals.push(hourlyId);
        this.debugLog(`[Bộ hẹn giờ khởi động] Nhắc mỗi giờ`);

        // 启动A为空的if规则定时器
        this.runEmptyIfTimer();

        // 加载定时公告
        this.loadScheduledAnnouncements();
        this.schedulePeriodicPost();
    },

    // 判断频道是否安静
    isChannelQuiet(windowMinutes = 5, maxMsgs = 2) {
        try {
            const cutoff = Date.now() - windowMinutes * 60 * 1000;
            const recent = (this.recentMsgTimestamps || []).filter(t => t >= cutoff).length;
            return recent <= maxMsgs;
        } catch (e) { return true; }
    },

    // 加载定时公告（适配间隔配置）
    loadScheduledAnnouncements() {
        try {
            const key = `bot_${CONFIG.botName}_scheduledAnnouncements`;
            const raw = localStorage.getItem(key);
            this.scheduledAnnouncements = raw ? JSON.parse(raw) : [];
            // 兼容旧数据格式
            this.scheduledAnnouncements = this.scheduledAnnouncements.map(item => {
                if (typeof item === 'string') {
                    return { content: item, interval: 15, lastSendTime: 0 }; // 默认15分钟间隔
                }
                return { ...item, lastSendTime: item.lastSendTime || 0 };
            });
        } catch (e) {
            this.scheduledAnnouncements = [];
        }
    },

    // 保存定时公告（适配间隔配置）
    saveScheduledAnnouncements() {
        try {
            const key = `bot_${CONFIG.botName}_scheduledAnnouncements`;
            // 移除lastSendTime避免持久化
            const saveData = this.scheduledAnnouncements.map(({ lastSendTime, ...rest }) => rest);
            localStorage.setItem(key, JSON.stringify(saveData || []));
        } catch (e) {}
    },

    // 安排周期性发布（10分钟检查+15%全局概率+一言/smallTalk互斥）
    schedulePeriodicPost() {
        const min = 10 * 60 * 1000; // 10分钟检查一次
        const delay = min;
        if (this.periodicTimeoutId) clearTimeout(this.periodicTimeoutId);
        this.periodicTimeoutId = setTimeout(() => {
            try {
                if (this.isMuted) { // 闭嘴状态跳过所有周期发布
                    this.periodicTimeoutId = null;
                    this.schedulePeriodicPost();
                    return;
                }
                const now = Date.now();
                // 检查定时公告（按间隔发送）
                this.scheduledAnnouncements.forEach(ann => {
                    if (now - ann.lastSendTime >= ann.interval * 60 * 1000) {
                        this.sendChat(ann.content);
                        ann.lastSendTime = now;
                    }
                });

                // 核心逻辑：全局15%概率 + 一言/smallTalk互斥
                const r = Math.random();
                if (r < 0.15) { // 仅15%概率触发
                    // 随机二选一，实现互斥
                    const chooseYiyan = Math.random() > 0.5;
                    if (chooseYiyan && CONFIG.CONST.periodic.includeYiyan) {
                        this.handleYiyan(); // 发送一言
                    } else if (!chooseYiyan && CONFIG.CONST.periodic.includeStyle) {
                        const s = this.pickStyleReply('smallTalkReplies');
                        if (s) this.sendChat(s); // 发送smallTalk（哦哦/了解啦等）
                    }
                }
                // 剩余85%概率不发送这两类内容
            } catch (e) { console.error('[Đăng định kỳ thất bại]', e); }
            this.periodicTimeoutId = null;
            this.schedulePeriodicPost();
        }, delay);
        this.debugLog(`[Bộ hẹn giờ khởi động] Đăng định kỳ, lần tiếp theo sau ${Math.round(delay/60000)} phút`);
    },

    // 从历史中挑选一条用户消息
    pickRandomPastMessage(maxScan = 500) {
        try {
            const arr = this.messageHistory.slice(-maxScan).filter(m => {
                if (!m || !m.text) return false;
                const t = m.text.trim();
                if (t.length < 3) return false;
                if (t === ',') return false;
                if (t.startsWith(CONFIG.CONST.cmdPrefix)) return false;
                if (/^Chào mừng\s+/.test(t)) return false;
                if (t.includes('thông báo kênh')) return false;
                return true;
            });
            if (!arr.length) return null;
            let candidate = arr[Math.floor(Math.random() * arr.length)];
            if (this.lastPeriodicSentId && arr.length > 1 && candidate.id === this.lastPeriodicSentId) {
                candidate = arr.find(m => m.id !== this.lastPeriodicSentId) || candidate;
            }
            this.lastPeriodicSentId = candidate.id;
            let text = candidate.text.trim();
            if (text.length > 200) text = text.slice(0,200) + '...';
            return text;
        } catch (e) { return null; }
    },

    // 检查禁言过期（受闭嘴状态控制）
    checkMuteExpire() {
        if (this.isMuted) return; // 闭嘴状态不发送过期提示
        const now = Date.now();
        for (const [user, expire] of this.silencedUsers.entries()) {
            if (expire !== Infinity && expire < now) {
                this.silencedUsers.delete(user);
                this.sendChat(`${user} đã hết thời gian cấm nói`);
            }
        }
    },

    // 清理资源
    cleanup() {
        // 清理定时器
        this.scheduledIntervals.forEach(t => {
            try { clearInterval(t); } catch (e) {}
            try { clearTimeout(t); } catch (e) {}
        });
        if (this.ifTimer) {
            clearInterval(this.ifTimer);
            this.ifTimer = null;
        }
        if (this.periodicTimeoutId) {
            clearTimeout(this.periodicTimeoutId);
            this.periodicTimeoutId = null;
        }

        // 保存数据
        try { this.saveScheduledAnnouncements(); } catch (e) {}
        try { this.saveIfRules(); } catch (e) {}
        this.ws && this.ws.close(1000, 'cleanup');
        console.log(`[${CONFIG.botName}] Đã dừng`);
    },

    // ====================== 命令处理方法 ======================
    // 帮助（受闭嘴状态控制）
    handleHelp(msg, _) {
        const { cmdPrefix } = CONFIG.CONST;
        const list = Object.entries(CMD_CONFIG)
            .filter(([_, c]) => c.public)
            .map(([_, c]) => `${cmdPrefix}${c.trigger[0]} ${c.params} - ${c.desc}`)
            .join('\n');
        this.sendChat(`**Danh sách lệnh**\n${list}`);
    },

    // 掷骰子（受闭嘴状态控制）
    handleRoll(msg, params) {
        let min = 1, max = 6;
        if (params.length > 0) {
            const range = params[0].split('-');
            if (range.length === 2 && !isNaN(range[0]) && !isNaN(range[1])) {
                min = Number(range[0]);
                max = Number(range[1]);
                if (min >= max) {
                    this.sendChat(`Phạm vi sai, giá trị nhỏ nhất phải nhỏ hơn giá trị lớn nhất`);
                    return;
                }
            } else {
                this.sendChat(`Định dạng：!roll 1-100`);
                return;
            }
        }
        const res = Math.floor(Math.random() * (max - min + 1)) + min;
        this.sendChat(`🎲 [${min}-${max}]：${res}`);
    },

    // AFK（受闭嘴状态控制）
    handleAfk(msg, _) {
        const nick = msg.nick;
        if (this.afkUsers.has(nick)) {
            const afkMs = Date.now() - this.afkUsers.get(nick);
            const afkStr = afkMs > 3600000 ? `${(afkMs / 3600000).toFixed(1)}h` : `${Math.floor(afkMs / 60000)}m`;
            this.afkUsers.delete(nick);
            this.sendChat(`${nick} đã trở lại | Rời khỏi：${afkStr}`);
        } else {
            this.afkUsers.set(nick, Date.now());
            this.sendChat(`${nick} AFK`);
        }
    },

    // 在线用户（受闭嘴状态控制）
    handleOnline(msg, _) {
        if (this.onlineUsers.size === 0) {
            this.sendChat(`Không có người dùng online`);
            return;
        }
        const list = [...this.onlineUsers].sort().join('、');
        this.sendChat(`Online（${this.onlineUsers.size} người）：${list}`);
    },

    // 最新消息ID（受闭嘴状态控制）
    handleMsglist(msg, _) {
        const latest = this.messageHistory.slice(-CONFIG.CONST.latestMsgCount).reverse();
        if (latest.length === 0) {
            this.sendChat(`Không có lịch sử tin nhắn`);
            return;
        }
        const list = latest.map(m => `#${m.id} @${m.nick}：${m.text.slice(0, 20)}`).join('\n');
        this.sendChat(`Tin nhắn gần đây：\n${list}`);
    },

    // 引用回复（受闭嘴状态控制）
    handleReply(msg, params) {
        const [idStr, ...content] = params;
        const msgId = Number(idStr);
        const replyText = content.join(' ');
        if (isNaN(msgId) || !replyText) {
            this.sendChat(`Định dạng：!reply ID tin nhắn nội dung`);
            return;
        }
        const target = this.messageIdMap.get(msgId);
        if (!target) {
            this.sendChat(`Không tìm thấy ID ${msgId}`);
            return;
        }
        const text = `> #${target.id} @${target.nick}：${target.text.slice(0,50)}\n@${msg.nick}：${replyText}`;
        this.sendChat(text);
    },

    // 用户信息（受闭嘴状态控制，新增tripcode展示）
    handleUserinfo(msg, params) {
        const target = params[0] || msg.nick;
        // 查找目标用户的最新消息，获取tripcode
        const targetMsg = this.messageHistory.find(m => m.nick === target && m.trip);
        const tripcode = targetMsg?.trip || 'Chưa thiết lập';
        
        const hasAct = this.userActivity.has(target);
        const isAfk = this.afkUsers.has(target);
        const isSil = this.isSilenced(target);
        const isPermSil = isSil && this.silencedUsers.get(target) === Infinity;
        const count = this.userActivity.get(target) || 0;
        // 核心修改：管理员判断改为tripcode
        const isAdmin = tripcode === CONFIG.CONST.ADMIN_TRIPCODE;
        const isOnline = this.onlineUsers.has(target);

        if (!hasAct && !isAfk && !isSil) {
            this.sendChat(`Không có hồ sơ của ${target}`);
            return;
        }

        const afkTime = isAfk ? Math.floor((Date.now() - this.afkUsers.get(target))/3600000) : 0;
        const silRemain = isSil && !isPermSil ? Math.ceil((this.silencedUsers.get(target)-Date.now())/60000) : 0;
        const text = `**${target}**\nSố tin nhắn：${count} tin\nTripcode：${tripcode}\nAFK：${isAfk ? `Có（${afkTime}h）` : 'Không'}\nCấm nói：${isSil ? (isPermSil ? 'Vĩnh viễn' : `Tạm thời ${silRemain}m`) : 'Không'}\nQuản trị viên：${isAdmin ? 'Có' : 'Không'}\nOnline：${isOnline ? 'Có' : 'Không'}`;
        this.sendChat(text);
    },

    // 活跃度统计（受闭嘴状态控制）
    handleStats(msg, _) {
        const top3 = [...this.userActivity.entries()]
            .sort((a,b) => b[1]-a[1])
            .slice(0,3)
            .map(([n,c]) => `${n}：${c} tin`)
            .join('、');
        const text = `**Thống kê**\nOnline：${this.onlineUsers.size} người\nTOP3 hoạt động：${top3 || 'Không'}`;
        this.sendChat(text);
    },

    // 导出记录（Node.js版本：保存到本地文件）
    handleSave(msg, _) {
        try {
            const filename = `hackchat_${CONFIG.channel}_${new Date().toISOString().slice(0,10)}.json`;
            fs.writeFileSync(filename, JSON.stringify(this.messageHistory, null, 2), 'utf8');
            this.sendChat(`Lịch sử chat đã được xuất ra file：${filename}`);
        } catch (err) {
            console.error('[Xuất thất bại]', err);
            this.sendChat(`Xuất lịch sử chat thất bại`);
        }
    },

    // 清空记录（受闭嘴状态控制）
    handleClear(msg, _) {
        this.messageHistory = [];
        this.messageIdMap.clear();
        this.nextMessageId = 1;
        this.sendChat(`Lịch sử tin nhắn local đã được xóa hết`);
    },

    // 计算器（受闭嘴状态控制）
    handleCalc(msg, params) {
        const calcStr = params.join(' ');
        if (!calcStr) {
            this.sendChat(`Định dạng：!calc 1+2*3`);
            return;
        }
        try {
            const validReg = /^[0-9\+\-\*\/\(\)\.\s]+$/;
            if (!validReg.test(calcStr)) {
                this.sendChat(`Chỉ hỗ trợ số +/*/-/()`);
                return;
            }
            const res = eval(calcStr);
            this.sendChat(`==${calcStr}== = ${isNaN(res) ? 'Không hợp lệ' : res}`);
        } catch (err) {
            this.sendChat(`Tính toán thất bại`);
        }
    },

    // 天气查询（受闭嘴状态控制）
    handleWeather(msg, params) {
        const city = params.join(' ');
        if (!city) {
            this.sendChat(`Định dạng：!weather Hà Nội`);
            return;
        }
        fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`)
            .then(res => res.text())
            .then(data => {
                this.sendChat(`${data}`);
            })
            .catch(() => {
                this.sendChat(`Tra cứu thời tiết thất bại`);
            });
    },

    // 随机表情（受闭嘴状态控制）
    handleEmoji(msg, _) {
        const emoji = CONFIG.CONST.emojiList[Math.floor(Math.random() * CONFIG.CONST.emojiList.length)];
        this.sendChat(`${emoji}`);
    },

    // 管理员帮助（受闭嘴状态控制）
    handleSpecialHelp(msg, _) {
        const { cmdPrefix } = CONFIG.CONST;
        const list = Object.entries(CMD_CONFIG)
            .filter(([_, c]) => c.auth)
            .map(([_, c]) => `${cmdPrefix}${c.trigger[0]} ${c.params} - ${c.desc}`)
            .join('\n');
        this.sendChat(`**Lệnh quản trị viên**\n${list}`);
    },

    // 临时禁言（管理员命令，受tripcode权限控制）
    handleMute(msg, params) {
        const [target, minStr] = params;
        const minutes = Number(minStr);
        if (isNaN(minutes) || minutes <= 0) {
            this.sendChat(`Số phút phải lớn hơn 0`);
            return;
        }
        if (target === CONFIG.botName) {
            this.sendChat(`Không thể cấm nói robot chính thân`);
            return;
        }
        this.silencedUsers.set(target, Date.now() + minutes * 60000);
        this.sendChat(`${target} bị cấm nói ${minutes} phút`);
    },

    // 永久禁言（管理员命令，受tripcode权限控制）
    handleSilence(msg, params) {
        const target = params[0];
        if (target === CONFIG.botName) {
            this.sendChat(`Không thể cấm nói robot chính thân`);
            return;
        }
        this.silencedUsers.set(target, Infinity);
        this.sendChat(`${target} bị cấm nói vĩnh viễn`);
    },

    // 解除禁言（管理员命令，受tripcode权限控制）
    handleUnsilence(msg, params) {
        const target = params[0];
        if (this.silencedUsers.delete(target)) {
            this.sendChat(`${target} đã được bỏ cấm nói`);
        } else {
            this.sendChat(`${target} chưa bị cấm nói`);
        }
    },

    // !con命令（管理员命令，受tripcode权限控制）
    handleCon(msg, params) {
        const content = params.join(' ');
        if (!content) {
            this.sendChat(`Định dạng：!con bất kỳ văn bản thuần`);
            return;
        }
        this.sendWSMessage({
            cmd: 'chat',
            text: content,
            clientId: this.clientId
        }, true);
    },

    // 频道公告（管理员命令，受tripcode权限控制）
    handleAnnounce(msg, params) {
        const text = params.join(' ');
        if (!text) {
            this.sendChat(`Định dạng：!announce nội dung thông báo`);
            return;
        }
        const announce = `**【Thông báo kênh】**\n${text}`;
        this.sendChat(announce);
    },

    // 管理定时公告（管理员命令，受tripcode权限控制）
    handlePann(msg, params) {
        const sub = params[0];
        if (!sub) {
            this.sendChat(`Định dạng：!pann add|remove|list|clear（Định dạng add：!pann add khoảng thời gian(phút) nội dung thông báo）`);
            return;
        }
        
        switch (sub) {
            case 'add':
                const interval = Number(params[1]);
                const content = params.slice(2).join(' ');
                if (isNaN(interval) || interval <= 0 || !content) {
                    this.sendChat(`Định dạng：!pann add khoảng thời gian(phút) nội dung thông báo`);
                    return;
                }
                this.scheduledAnnouncements = this.scheduledAnnouncements || [];
                this.scheduledAnnouncements.push({
                    content,
                    interval,
                    lastSendTime: 0
                });
                this.saveScheduledAnnouncements();
                this.sendChat(`Đã thêm thông báo định kỳ（khoảng thời gian ${interval} phút）：${content}`);
                break;
            case 'remove':
                if (!params[1]) {
                    this.sendChat(`Định dạng：!pann remove chỉ số/nội dung phần`);
                    return;
                }
                this.scheduledAnnouncements = this.scheduledAnnouncements || [];
                const idx = Number(params[1]);
                if (!isNaN(idx) && idx >= 1 && idx <= this.scheduledAnnouncements.length) {
                    const removed = this.scheduledAnnouncements.splice(idx-1,1)[0];
                    this.saveScheduledAnnouncements();
                    this.sendChat(`Đã xóa thông báo #${idx}（khoảng thời gian ${removed.interval} phút）：${removed.content}`);
                } else {
                    const needle = params[1].trim();
                    let i = this.scheduledAnnouncements.findIndex(a => a.content.trim() === needle);
                    if (i === -1) {
                        const low = needle.toLowerCase();
                        i = this.scheduledAnnouncements.findIndex(a => a.content.toLowerCase().includes(low));
                    }
                    if (i >= 0) {
                        const removed = this.scheduledAnnouncements.splice(i,1)[0];
                        this.saveScheduledAnnouncements();
                        this.sendChat(`Đã xóa thông báo #${i+1}（khoảng thời gian ${removed.interval} phút）：${removed.content}`);
                    } else {
                        this.sendChat(`Không tìm thấy thông báo được chỉ định, sử dụng !pann list để xem chỉ số`);
                    }
                }
                break;
            case 'list':
                if (!this.scheduledAnnouncements || this.scheduledAnnouncements.length === 0) {
                    this.sendChat(`Không có thông báo định kỳ`);
                    return;
                }
                const list = this.scheduledAnnouncements.map((a,i)=>`${i+1}. [khoảng thời gian ${a.interval} phút] ${a.content}`).join('\n');
                this.sendChat(`**Thông báo định kỳ**\n${list}`);
                break;
            case 'clear':
                this.scheduledAnnouncements = [];
                this.saveScheduledAnnouncements();
                this.sendChat(`Đã xóa hết tất cả thông báo định kỳ`);
                break;
            default:
                this.sendChat(`Lệnh con không xác định, sử dụng add|remove|list|clear`);
        }
    },

    // 处理!if命令（管理员命令，受tripcode权限控制，新增addz正则模式）
    handleIf(msg, params) {
        const sub = params[0];
        if (!sub) {
            this.sendChat(`Định dạng：!if add A B N|addz A B N|list|remove|clear`);
            this.sendChat(`Giải thích：add là chế độ thông thường addz là chế độ regex`);
            return;
        }

        switch (sub) {
            case 'add':
                // 解析参数：A B N（注意A/B可能包含空格，最后一个参数是概率）
                const probability = Number(params[params.length - 1]);
                if (isNaN(probability) || probability < 0 || probability > 100) {
                    this.sendChat(`Xác suất N phải là số từ 0-100`);
                    return;
                }
                const trigger = params.slice(1, -2).join(' ') || params[1] || ''; // A
                const reply = params.slice(-2, -1).join(' ') || ''; // B
                
                if (!reply) {
                    this.sendChat(`Định dạng sai：!if add A B N（B không được để trống）`);
                    return;
                }

                const ruleId = Date.now(); // 用时间戳作为唯一ID
                this.ifRules.push({
                    trigger: trigger.trim(),
                    reply: reply.trim(),
                    probability,
                    id: ruleId,
                    isRegex: false // 标记为普通模式
                });
                this.saveIfRules();
                this.sendChat(`Đã thêm quy tắc trả lời tự động：Từ kích="${trigger || 'trống'}"，Trả lời="${reply}"，Xác suất=${probability}%`);
                break;
            case 'addz':
                // 新增addz子命令，正则模式
                const regexProbability = Number(params[params.length - 1]);
                if (isNaN(regexProbability) || regexProbability < 0 || regexProbability > 100) {
                    this.sendChat(`Xác suất N phải là số từ 0-100`);
                    return;
                }
                const regexTrigger = params.slice(1, -2).join(' ') || params[1] || ''; // 正则表达式
                const regexReply = params.slice(-2, -1).join(' ') || ''; // 回复内容
                
                if (!regexReply) {
                    this.sendChat(`Định dạng sai：!if addz A B N（B không được để trống）`);
                    return;
                }

                const regexRuleId = Date.now();
                this.ifRules.push({
                    trigger: regexTrigger.trim(),
                    reply: regexReply.trim(),
                    probability: regexProbability,
                    id: regexRuleId,
                    isRegex: true // 标记为正则模式
                });
                this.saveIfRules();
                this.sendChat(`Đã thêm quy tắc trả lời tự động：Regex="${regexTrigger || 'trống'}"，Trả lời="${regexReply}"，Xác suất=${regexProbability}%`);
                break;
            case 'list':
                if (!this.ifRules.length) {
                    this.sendChat(`Không có quy tắc trả lời tự động`);
                    return;
                }
                const ifList = this.ifRules.map((r, i) => `${i+1}. ${r.isRegex ? '[Regex]' : '[Thông thường]'} Từ kích="${r.trigger || 'trống'}"，Trả lời="${r.reply}"，Xác suất=${r.probability}%`).join('\n');
                this.sendChat(`**Quy tắc trả lời tự động**\n${ifList}`);
                break;
            case 'remove':
                const idx = Number(params[1]);
                if (isNaN(idx) || idx < 1 || idx > this.ifRules.length) {
                    this.sendChat(`Chỉ số sai, vui lòng sử dụng !if list để xem chỉ số hợp lệ`);
                    return;
                }
                const removedRule = this.ifRules.splice(idx-1, 1)[0];
                this.saveIfRules();
                this.sendChat(`Đã xóa quy tắc trả lời tự động：${removedRule.isRegex ? '[Regex]' : '[Thông thường]'} Từ kích="${removedRule.trigger || 'trống'}"，Trả lời="${removedRule.reply}"`);
                break;
            case 'clear':
                this.ifRules = [];
                this.saveIfRules();
                this.sendChat(`Đã xóa hết tất cả quy tắc trả lời tự động`);
                break;
            default:
                this.sendChat(`Lệnh con không xác định, sử dụng add|addz|list|remove|clear`);
        }
    },

    // 处理!talk命令（管理员命令，受tripcode权限控制）
    handleTalk(msg, params) {
        const action = params[0]?.toLowerCase();
        if (!action || !['on', 'off'].includes(action)) {
            // 闭嘴状态下，不发送格式错误提示
            if (this.isMuted) return;
            this.sendChat(`Định dạng sai：!talk on（bật nói） / !talk off（im lặng）`);
            return;
        }

        if (action === 'off') {
            this.isMuted = true;
            this.sendChat(`Đã im lặng, u呜呜`, true); // 强制发送
            console.log(`[${CONFIG.botName}] Đã chuyển sang trạng thái im lặng`);
        } else {
            this.isMuted = false;
            this.sendChat(`Mở miệng, nói chuyện`, true); // 强制发送
            console.log(`[${CONFIG.botName}] Đã chuyển sang trạng thái nói bình thường`);
        }
    },

    // 停止机器人（管理员命令，受tripcode权限控制）
    handleStop(msg, _) {
        // 核心修改：校验tripcode权限
        if (!this.hasAdminAuth(msg)) {
            this.sendChat(`Không có quyền, chỉ quản trị viên với tripcode 2UE++I mới có thể thực hiện`);
            return;
        }
        try {
            this.sendChat('Hủy diệt đi, biến mất đi.');
        } catch (e) {}
        this.stopped = true;
        setTimeout(() => {
            try { this.cleanup(); } catch (e) {}
        }, 500);
    },

    // 风格回复选择器
    pickStyleReply(type) {
        try {
            const pool = (CONFIG.CONST.styleTemplates && CONFIG.CONST.styleTemplates[type]) || [];
            if (!pool.length) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        } catch (e) { return null; }
    },

    // 随机工具
    randomPick(arr) { return arr && arr.length ? arr[Math.floor(Math.random()*arr.length)] : null; },

    // 一言（受闭嘴状态控制）
    async handleYiyan(msg, _) {
        try {
            const res = await fetch('https://v1.hitokoto.cn/?encode=json');
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            const text = (data.hitokoto || data.text || '').trim();
            const from = (data.from || data.from_who || '').trim();
            if (!text) {
                this.sendChat('Lấy câu nói thất bại');
                return;
            }
            const out = from ? `${text} —— ${from}` : `${text}`;
            this.sendChat(out);
        } catch (e) {
            console.error('[Lỗi câu nói]', e);
            this.sendChat('Lấy câu nói thất bại, vui lòng thử lại sau');
        }
    }
};

// 捕获退出信号，清理资源
process.on('SIGINT', () => {
    console.log('\n[Nhận tín hiệu thoát] Đang dừng robot...');
    bot.cleanup();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[Nhận tín hiệu kết thúc] Đang dừng robot...');
    bot.cleanup();
    process.exit(0);
});

// 启动机器人
bot.init();
