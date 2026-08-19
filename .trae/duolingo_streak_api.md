# 多邻国连胜天数 API 接入指南

> 多邻国没有官方公开 API，以下接口均为社区发现的未文档化公开接口，**不保证长期稳定**。

---

## 一、核心 API 端点

```
GET https://www.duolingo.com/2017-06-30/users?username={用户名}&fields=streak,streakData{currentStreak,previousStreak}}
```

### 返回示例

```json
{
  "users": [{
    "streak": 365,
    "streakData": {
      "currentStreak": {
        "length": 365,
        "endDate": "2026-08-19"
      },
      "previousStreak": {
        "length": 42
      }
    }
  }]
}
```

### 关键字段说明

| 字段 | 含义 |
|---|---|
| `users[0].streak` | 当前连胜天数 |
| `users[0].streakData.currentStreak.length` | 当前连胜长度 |
| `users[0].streakData.currentStreak.endDate` | 连胜最后更新日期（可判断今日是否完成） |
| `users[0].streakData.previousStreak.length` | 之前一次连胜天数 |

---

## 二、前端博客集成示例

```javascript
async function getDuolingoStreak(username) {
  const res = await fetch(
    `https://www.duolingo.com/2017-06-30/users?username=${username}&fields=streak,streakData%7BcurrentStreak,previousStreak%7D%7D`
  );
  const data = await res.json();
  const user = data.users[0];

  const streak = Math.max(
    user?.streak ?? 0,
    user?.streakData?.currentStreak?.length ?? 0,
    user?.streakData?.previousStreak?.length ?? 0
  );

  const lastDate = user?.streakData?.currentStreak?.endDate;
  const today = new Date().toISOString().slice(0, 10);
  const doneToday = lastDate === today;

  return { streak, doneToday };
}

// 使用
getDuolingoStreak('你的多邻国用户名').then(({ streak, doneToday }) => {
  document.getElementById('streak').textContent =
    `${doneToday ? '🔥' : '🥶'} 多邻国连胜 ${streak} 天`;
});
```

---

## 三、⚠️ 注意事项

| 问题 | 说明 |
|---|---|
| **非官方 API** | 多邻国可能随时更改或关闭接口 |
| **CORS 限制** | 该接口**不支持 CORS**，浏览器直接 `fetch` 可能跨域报错 |
| **解决方案** | 通过自建后端 / Serverless（Vercel、Cloudflare Workers）做代理转发 |
| **字段 DSL** | `fields` 参数类似 GraphQL，末尾多一个 `}` 是必需的 |

---

## 四、替代方案：现成 SVG 卡片（零代码）

社区已将 API 封装为可直接嵌入博客的 SVG 图片服务：

```
https://duolingo-streak-tracker.vercel.app/api/card/{用户名}?theme=polar&variant=default
```

### Markdown 嵌入

```markdown
![多邻国连胜](https://duolingo-streak-tracker.vercel.app/api/card/{用户名}?theme=polar&variant=default)
```

### 可选参数

| 参数 | 可选值 |
|---|---|
| `theme` | `polar` / `eel` / `duo` / `cardinal` / `owl` / `macaw` / `butterfly` |
| `variant` | `default` / `compact` / `minimal` / `badges` |
| `show` | `streak,xp,languages,league,plus`（控制显示指标） |

> 第三方社区服务，建议自行部署：[marlonangeli/duolingo-streak-tracker](https://github.com/marlonangeli/duolingo-streak-tracker)

---

## 五、扩展：更多数据接口

如需 XP、段位、课程等完整数据：

```
GET https://www.duolingo.com/2023-05-23/users/{userId}
```

> 此接口需要**用户数字 ID**，可先从 `2017-06-30/users?username=xxx` 接口获取 `id` 字段。
