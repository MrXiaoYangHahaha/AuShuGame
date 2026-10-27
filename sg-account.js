/*!
 * sg-account.js —— 学习勇士 · 统一积分账户
 * 所有游戏共用一份：积分 / 奖励清单 / 兑换记录 / 家长密码 / 每日时长
 * 页面加载顺序：<script src="sg-account.js"></script> 再跑游戏自身脚本
 */
(function (global) {
  'use strict';

  var KEY = 'sg_account_v1';
  // 旧版各游戏独立存档，仅用于首次运行时迁移
  var LEGACY = ['english_quest_save_v1', 'aoshu_classroom_test_save_v1', 'aoshu_quest_save_v1'];

  var DEFAULT_REWARDS = [
    { id: 'r1', icon: '🎮', name: '周末多玩30分钟游戏', desc: '延长游戏时间30分钟', price: 100, auto: false },
    { id: 'r2', icon: '📺', name: '周末多看30分钟电视', desc: '延长看电视30分钟', price: 80, auto: false },
    { id: 'r3', icon: '🧹', name: '免做一次家务', desc: '免除一次家务任务', price: 60, auto: false },
    { id: 'r4', icon: '🍭', name: '一份小零食', desc: '当天提供小零食', price: 50, auto: false },
    { id: 'r5', icon: '🎬', name: '选择周末家庭电影', desc: '本周电影由你选', price: 40, auto: true },
    { id: 'r6', icon: '🍽️', name: '选择晚餐菜品', desc: '指定一天晚餐主菜', price: 30, auto: true }
  ];

  var hasLS = (function () {
    try { localStorage.setItem('__sg_t', '1'); localStorage.removeItem('__sg_t'); return true; }
    catch (e) { return false; }
  })();

  var mem = null;   // localStorage 不可用时的内存兜底
  var cache = null; // 当前账户缓存
  var snap = null;  // 游戏侧上次同步的快照（用于冲突合并）

  function blank() {
    return {
      v: 1,
      stars: 0,
      totalEarned: 0,
      rewards: JSON.parse(JSON.stringify(DEFAULT_REWARDS)),
      pending: [],   // 待家长审核
      approved: [],  // 已批准待使用
      used: [],      // 已使用
      log: [],       // 积分明细
      pin: '1234',
      dailyLimit: 0, // 秒；0 = 各游戏用自带默认
      unlockAll: false,
      updatedAt: 0
    };
  }

  function rawRead() {
    if (!hasLS) return mem;
    try {
      var s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) { return null; }
  }

  function rawWrite(obj) {
    if (!hasLS) { mem = obj; return; }
    try { localStorage.setItem(KEY, JSON.stringify(obj)); }
    catch (e) { mem = obj; }
  }

  function normalize(a) {
    var d = blank();
    if (!a || typeof a !== 'object') a = {};
    for (var k in d) if (!(k in a)) a[k] = d[k];
    if (!Array.isArray(a.rewards) || !a.rewards.length) a.rewards = d.rewards;
    ['pending', 'approved', 'used', 'log'].forEach(function (k) {
      if (!Array.isArray(a[k])) a[k] = [];
    });
    a.stars = Math.max(0, Math.floor(Number(a.stars) || 0));
    a.totalEarned = Math.max(0, Math.floor(Number(a.totalEarned) || 0));
    a.dailyLimit = Math.max(0, Math.floor(Number(a.dailyLimit) || 0));
    if (!a.pin) a.pin = '1234';
    if (a.log.length > 400) a.log.length = 400;
    return a;
  }

  // 首次运行：从旧存档里挑积分最多的那份迁移过来，避免"清零"
  function migrate(a) {
    var best = null, bestStars = -1;
    for (var i = 0; i < LEGACY.length; i++) {
      if (!hasLS) break;
      try {
        var o = JSON.parse(localStorage.getItem(LEGACY[i]) || 'null');
        if (o && typeof o.stars === 'number' && o.stars > bestStars) {
          bestStars = o.stars; best = o;
        }
      } catch (e) { }
    }
    if (!best) return a;
    a.stars = Math.max(0, Math.floor(best.stars || 0));
    a.totalEarned = Math.max(0, Math.floor(best.totalStars || best.stars || 0));
    if (Array.isArray(best.rewards) && best.rewards.length) a.rewards = best.rewards;
    if (Array.isArray(best.pending)) a.pending = best.pending;
    if (Array.isArray(best.approved)) a.approved = best.approved;
    if (Array.isArray(best.used)) a.used = best.used;
    a.log = [{ t: Date.now(), d: 0, r: '由旧版存档合并初始积分 ' + a.stars }];
    return a;
  }

  function get() {
    if (cache) return cache;
    var a = rawRead();
    if (!a) a = migrate(blank());
    cache = normalize(a);
    if (!rawRead()) rawWrite(cache);
    return cache;
  }

  function commit(a) {
    a.updatedAt = Date.now();
    cache = normalize(a);
    rawWrite(cache);
    return cache;
  }

  function reload() {
    cache = null;
    return get();
  }

  function pushLog(a, delta, reason) {
    a.log.unshift({ t: Date.now(), d: delta, r: reason || '' });
    if (a.log.length > 400) a.log.length = 400;
  }

  // ---------- 对外 API ----------
  var SG = {
    KEY: KEY,
    DEFAULT_REWARDS: DEFAULT_REWARDS,

    get: get,
    reload: reload,
    stars: function () { return get().stars; },
    rewards: function () { return get().rewards; },
    pending: function () { return get().pending; },
    approved: function () { return get().approved; },
    used: function () { return get().used; },
    dailyLimit: function () { return get().dailyLimit; },
    unlockAll: function () { return !!get().unlockAll; },
    log: function () { return get().log; },

    /** 加分（游戏内通关等） */
    addStars: function (n, reason) {
      n = Math.floor(Number(n) || 0);
      if (!n) return get().stars;
      var a = reload();
      a.stars = Math.max(0, a.stars + n);
      if (n > 0) a.totalEarned += n;
      pushLog(a, n, reason);
      commit(a);
      return a.stars;
    },

    /** 家长直接设定积分 */
    setStars: function (n, reason) {
      n = Math.max(0, Math.floor(Number(n) || 0));
      var a = reload();
      var delta = n - a.stars;
      a.stars = n;
      if (delta > 0) a.totalEarned += delta;
      pushLog(a, delta, reason || '家长调整');
      commit(a);
      return a.stars;
    },

    /** 兑换：立即扣分，自动批准的直接进"已获得"，否则进"待审核" */
    redeem: function (id) {
      var a = reload();
      var r = null;
      for (var i = 0; i < a.rewards.length; i++) if (a.rewards[i].id === id) r = a.rewards[i];
      if (!r) return { ok: false, msg: '奖励不存在' };
      if (a.stars < r.price) return { ok: false, msg: '智慧星不够，还差 ' + (r.price - a.stars) + ' 颗' };

      a.stars -= r.price;
      var item = {
        id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
        rid: r.id, icon: r.icon, name: r.name, price: r.price, auto: !!r.auto,
        date: new Date().toLocaleDateString('zh-CN')
      };
      if (r.auto) a.approved.push(item); else a.pending.push(item);
      pushLog(a, -r.price, '兑换：' + r.name);
      commit(a);
      return { ok: true, auto: !!r.auto, msg: r.auto ? '兑换成功，已自动批准' : '申请已提交，等家长确认' };
    },

    /** 使用已批准的奖励 */
    useReward: function (id) {
      var a = reload();
      if (a.used.indexOf(id) < 0) a.used.push(id);
      commit(a);
      return true;
    },

    /** 家长审核 */
    audit: function (index, ok) {
      var a = reload();
      var r = a.pending[index];
      if (!r) return false;
      if (ok) {
        a.approved.push(r);
      } else {
        a.stars += r.price;               // 拒绝 → 退分
        pushLog(a, r.price, '兑换被拒，退回：' + r.name);
      }
      a.pending.splice(index, 1);
      commit(a);
      return true;
    },

    /** 奖励清单增删改 */
    saveRewards: function (list) {
      var a = reload();
      a.rewards = list.map(function (r, i) {
        return {
          id: r.id || ('r' + Date.now() + i),
          icon: r.icon || '🎁',
          name: r.name || '新奖励',
          desc: r.desc || '',
          price: Math.max(1, Math.floor(Number(r.price) || 10)),
          auto: !!r.auto
        };
      });
      commit(a);
      return a.rewards;
    },

    /** 家长密码 */
    checkPin: function (p) { return String(p) === String(get().pin); },
    setPin: function (p) {
      p = String(p || '').trim();
      if (p.length < 4) return false;
      var a = reload(); a.pin = p; commit(a); return true;
    },

    /** 每日时长（秒），0 表示各游戏用默认 */
    setDailyLimit: function (seconds) {
      var a = reload();
      a.dailyLimit = Math.max(0, Math.floor(Number(seconds) || 0));
      commit(a);
      return a.dailyLimit;
    },

    setUnlockAll: function (on) {
      var a = reload(); a.unlockAll = !!on; commit(a); return a.unlockAll;
    },

    /** 重置：积分与兑换记录清零，奖励清单恢复默认 */
    resetAccount: function (keepRewards) {
      var a = blank();
      if (keepRewards) a.rewards = get().rewards;
      a.pin = get().pin;
      a.dailyLimit = get().dailyLimit;
      a.unlockAll = get().unlockAll;
      pushLog(a, 0, '家长重置账户');
      commit(a);
      return a;
    },

    // ---------- 游戏侧桥接 ----------
    /** 从统一账户拉取共享字段到游戏状态 S */
    pull: function (S) {
      if (!S) return S;
      var a = reload();
      S.stars = a.stars;
      S.rewards = JSON.parse(JSON.stringify(a.rewards));
      S.pending = JSON.parse(JSON.stringify(a.pending));
      S.approved = JSON.parse(JSON.stringify(a.approved));
      S.used = JSON.parse(JSON.stringify(a.used));
      if (a.dailyLimit > 0) S.dailyLimit = a.dailyLimit;
      snap = JSON.parse(JSON.stringify(pick(S)));
      return S;
    },

    /** 把游戏状态里被改动过的共享字段写回统一账户（未改动的不覆盖，避免多标签互相打架） */
    push: function (S) {
      if (!S) return;
      if (!snap) { SG.pull(S); return; }
      var a = reload();
      var cur = pick(S);
      var changed = false;
      SHARED.forEach(function (k) {
        if (JSON.stringify(cur[k]) !== JSON.stringify(snap[k])) {
          a[k] = JSON.parse(JSON.stringify(cur[k]));
          changed = true;
        }
      });
      if (changed) commit(a);
      snap = JSON.parse(JSON.stringify(cur));
    },

    /** 读一次最新积分，用于页面上显示 */
    refresh: function () { return reload().stars; }
  };

  var SHARED = ['stars', 'rewards', 'pending', 'approved', 'used'];

  function pick(S) {
    var o = {};
    SHARED.forEach(function (k) { o[k] = S[k]; });
    return o;
  }

  global.SG = SG;
})(window);
