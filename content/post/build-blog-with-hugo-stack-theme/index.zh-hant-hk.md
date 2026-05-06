---
title: "教學｜用 Hugo + Stack 主題快速整個人博客"
date: 2026-05-06T15:00:00+08:00
draft: false
image: cover.png
categories:
    - 教學
    - Hugo
tags:
    - 博客
    - Hugo
---

# 用 Hugo + Stack 主題快速整個人博客

> 呢篇文會教你點樣用 Hugo + Stack 主題快速整個人博客，再加埋 Github Pages，實現零成本整個人博客嘅全過程。<br>
> 呢篇文下面用嘅係 Stack 主題，如果你用嘅主題唔同，可能有啲內容唔啱，記得睇返你用緊主題嘅文件。

## 開始之前準備

正式開始之前，請確保你有以下嘅**條件**：<br>
```
    - 一部電腦
        - 要裝咗 Visual Studio Code（或者其他 IDE，呢篇文用 Visual Studio Code 示範）
        - 要裝咗 Git
        - 要可以正常上網
    - 一個有效嘅 Github 帳號
```

## 關於 Hugo

Hugo 係一個用 Go 語言寫嘅靜態網站生成器。佢嘅框架好靈活，仲支持分類同多語言系統，所以我覺得 Hugo 好啱用嚟整啲簡單嘅個人博客或者靜態展示網頁。

---

## 第一步：站喺巨人嘅膊頭出發

### Clone Stack 主題嘅模板倉庫

Stack 官方為我哋準備咗一個快速上手嘅 Github 模板倉庫。用呢個模板，我哋可以跳過裝 Hugo 同裝主題文件嘅繁瑣步驟，仲可以快速睇到效果。<br>
首先撳入 Stack 嘅模板倉庫：[hugo-theme-stack-starter](https://github.com/CaiJimmy/hugo-theme-stack-starter)<br>
撳右上角綠色嘅 "Use this template" 按鈕，揀 "Create a new repository" 新建一個自己嘅倉庫。<br>
![Github 模板倉庫頁面](1.png "Github 模板倉庫頁面")<br>
喺 Repository name 入面填自己嘅倉庫名。建議用以下格式<br>
`你嘅 Github 用戶名.github.io` <br>
點解建議用呢個格式呢？因為如果你用呢個格式，你嘅博客網址會係 `https://你嘅 Github 用戶名.github.io/`。如果你用自己改嘅倉庫名，網址會變成 `https://你嘅 Github 用戶名.github.io/你嘅倉庫名/`。相比之下，前者少咗幾個字，簡單啲。<br>
同時喺 Choose visibility 入面，你**一定要揀 Public （公開倉庫）**。唔揀公開可能會導致無法成功部署頁面。
![Github 倉庫創建頁面](2.png "Github 倉庫創建頁面")<br>

### 部署頁面之前嘅設置

正式部署你嘅博客之前，**一定要做以下幾個設置**：<br>
首先撳 **Code > Codespaces > Create codespace on master** 創建一個 Github 代碼空間。唔使擔心呢啲雲服務會收費，個人用戶有**每月2000分鐘免費額度**，每次部署大概用 1~2 分鐘，除非你係一日寫十幾篇文嘅傳奇寫手，否則都夠用。
![Github 代碼空間創建頁面](3.png "Github 代碼空間創建頁面")<br>
創建好之後返去你嘅倉庫，喺上面導航撳 **Settings**，喺 **Pages** 頁面將 **Build and deployment** 嘅選項改成 **GitHub Actions**。<br>
![Settings 頁面](4.png "Settings 頁面")<br>
然後喺**你嘅倉庫名/config/_default/config.toml**入面，將 baseurl 後面嘅值改成你嘅博客網址。網址喺上文有詳細說明，請根據你嘅情況填寫。記住要撳鉛筆圖標先可以在線編輯呢個配置文件。
![config.toml 頁面](5.png "config.toml 頁面")<br>
靜靜等幾分鐘之後，訪問你嘅博客網址，你應該就可以睇到一個示例頁面。
![主題示例頁面](6.png "主題示例頁面")<br>

## 第二步：本地同雲端嘅連接魔法

### 用 Visual Studio Code（VSCode） 連接 Github 倉庫

首先開 VSCode，喺歡迎頁面揀複製 Git 存放庫，喺上面搜索框揀從 Github 複製。喺本地揀一個文件夾存放。**文件夾目錄最好唔好有非英文字符**。<br>
![VSCode示例頁面](7.png "VSCode示例頁面")<br>
強烈建議你喺文件選項卡入面**另存工作區成為一個工作區文件**，防止後面工作區唔小心關咗唔知點開，仲方便好多！<br>

### 推送修改到 Github 倉庫

保存修改之後喺 VSCode 左邊導航欄嘅 git 界面填說明並同步推送，就可以自動更新到 Github 倉庫，同時，當我哋推送之後，Github 會自動開始部署我哋嘅博客頁面。<br>

## 第三步：超級變變變

呢節簡單講解啲可能需要修改嘅配置，包括點樣自定義博客標題、頭像等內容。<br>
> 如果冇提到嘅配置項目，代表需求唔大，可以自己揀是否配置。

### config.toml 站點嘅核心配置

呢個係 Hugo 最基本嘅全局配置文件，定義站點嘅核心屬性：<br>
`baseurl`喺上文部署時改過，用嚟改站點部署後嘅根 URL（例如 GitHub Pages 地址），Hugo 構建時用嚟生成絕對鏈接。<br>
`locale`站點默認語言（例如 en-us），影響多語言渲染、日期格式等。<br>
`title`站點嘅主標題（會顯示喺瀏覽器標籤、首頁頭部等位置）。<br>
`pagination.pagerSize`首頁 / 歸檔頁每頁顯示幾多篇文章。<br>

### menu.toml 自己嘅社交大門

menu.toml 用嚟**自定義**站點嘅主菜單同社交菜單（支持自定義圖標、新標籤頁等）<br>
呢度只講解點樣配置社交圖標菜單。<br>

```
[[social]]
    identifier = "github"//呢個係鏈接嘅識別符
    name       = "GitHub"//鏈接顯示嘅名
    url        = "https://github.com/CaiJimmy/hugo-theme-stack"//鏈接地址

    [social.params]//鏈接嘅圖標
        icon = "brand-github"//圖標嘅地址
```
### params.toml 自己嘅形象配置

params.toml入面可以配置自己嘅頭像同網站嘅圖標。<br>

```
[sidebar]
    emoji    = "🍥"//當前嘅心情emoji
    subtitle = "Lorem ipsum dolor sit amet, consectetur adipiscing elit."//博客嘅副標題
    avatar   = "img/avatar.png"//頭像嘅地址
```
其中，頭像嘅存放位置係`\assets\img\`入面，官方建議用**150px*150px嘅正方形圖片**，作者**未試過其他尺寸**，但應該都幾清晰。將自己嘅頭像放入呢個文件夾並改文件名做`avatar.png`就可以配置自己嘅頭像。<br>

`favicon        = "img/favicon.png"`<br>
呢度係配置網站圖標嘅地方，可以將自己嘅圖標文件放入，經過測試，ico 類型嘅圖標文件都可以正常顯示。<br>

```
[footer]
    since = 2020       # 頁腳顯示嘅建站年份（例如 "© 2020 - 2024"）
    customText = ""    # 頁腳自定義文本（例如版權聲明、備案信息）
```
`since`填建站年份，會自動計算日期哦。<br>

## 第四步：開始正式寫自己嘅第一篇博文啦

博文存放喺`\content\post`入面，每篇文章都係一個獨立嘅文件夾。<br>

### 刪除自帶嘅示例文章

首先，將示例文章全部刪掉。直接全部刪掉。<br>

### 開始寫自己嘅文章

我建議第一篇博文可以寫下點解整呢個博客同呢個博客會更新啲咩內容。<br>
喺`\content\post`入面新建一個文件夾`aboutMe`<br>
喺文件夾`aboutMe`入面新建一個`index.zh.md`文件，其中`zh`係文章嘅語言，如果你唔打算將文章翻譯成其他語言，可以省略語言選項。<br>
Hugo 入面嘅文章都係用 **Markdown 語法** 寫嘅，呢度唔作介紹。<br>
如果你需要為呢篇博客配圖，將圖片同`.md`文件放喺同一層就可以，方便引用，我呢度畀你一個文章開頭模板。<br>

```
---
title: "我係文章標題"
date: 2026-05-06T15:00:00+08:00//我係發佈時間
image: cover.png//呢個係文章頭圖嘅路徑
categories://呢度係分類
    - 分類1
    - 分類2
tags://呢度係標籤
    - 博客
    - Hugo
---
```

最後，保存好你嘅第一篇博文。推送到 Github 倉庫，等部署，部署成功之後就可以睇到你寫嘅文章啦。<br>

## 常見問題匯總（持續更新中）

### 部署時 deploy 環節花費時間耐

當部署時，喺 deploy 環節花費嘅時間一般係 **20 ~ 60 秒**，如果明顯超過呢個時間，請撳入去睇詳情。<br>
如果出現咗下面嘅情況，**請即刻取消部署，避免代碼空間嘅免費額度白白浪費**。<br>
![無限循環中](8.png "無限循環中")<br>
至於點解會出現呢種情況，我估係 Github 嘅伺服器處理唔到嘅問題。一般發生喺凌晨（地球另一邊嘅人上班嘅時間），對此，我建議**熱杯牛奶然後瞓覺**，等第二日起身再試部署就得啦。

---
*最後編輯於 5 月 6 日*