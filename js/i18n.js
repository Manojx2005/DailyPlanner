"use strict";
/* =============================================================================
   i18n.js — multi-language support for DailyPlanner
   Languages: English (en), Japanese (ja), Vietnamese (vi)

   Public API
   ----------
   MESSAGES            dict of { en, ja, vi } translation maps (key → string)
   getLang()           current language code ('en' | 'ja' | 'vi')
   setLang(lang)       persist to localStorage, returns the lang code
   t(key, lang?)       translate key; falls back en → key
   applyLanguage(lang?, root?)  walk [data-i18n], [data-i18n-ph], [data-i18n-aria]
   availableLanguages()         [{code, label}, …]
   setCurrency(cur)             set global currency for placeholder replacement
============================================================================= */

let currentCurrency = "¥";
export function setCurrency(cur) { currentCurrency = cur; }
export function getCurrency() { return currentCurrency || "¥"; }

export const MESSAGES = {

  /* ------------------------------------------------------------------ */
  en: {
    /* ── App chrome ── */
    "app.title":           "Day Planner",
    "app.tagline":         "Enter what's fixed, list what you need to do — get a real schedule and your actual free time.",
    "app.footer":          "Saved in the cloud · no build step · built for daily life in Tokyo",

    /* ── Header readouts ── */
    "readout.freeToday":   "Free time today",
    "readout.planToCalc":  "plan to calculate",
    "readout.totalTaxIncl":"Total (tax incl.)",
    "readout.netSavings":  "Net savings",
    "readout.freeWeek":    "Free this week",
    "readout.sevenDay":    "7-day plan",
    "readout.toBuyMeals":  "To buy for meals",
    "readout.pickRecipes": "pick recipes",

    /* ── User menu / account ── */
    "menu.importJson":     "Import JSON",
    "menu.exportJson":     "Export JSON",
    "menu.signOut":        "Sign out",
    "menu.signIn":         "Sign in with Google",

    /* ── Tab bar ── */
    "tab.day":             "Day",
    "tab.week":            "Week",
    "tab.month":           "Month",
    "tab.shopping":        "Shopping",
    "tab.meals":           "Meals",
    "tab.finance":         "Finance",

    /* ── Day tab: section headings ── */
    "day.sec1.title":      "Day window",
    "day.sec1.hint":       "When you're up and reachable. Everything is scheduled inside this.",
    "day.sec2.title":      "Fixed blocks",
    "day.sec2.hint":       "Classes and your part-time job. Tick the weekdays each one repeats on — that drives the Week tab.",
    "day.sec3.title":      "Meals",
    "day.sec3.hint":       "Prep + eating time. These reserve slots so tasks don't land on them.",
    "day.sec4.title":      "Tasks to fit",
    "day.sec4.hint":       "Study, coding projects, chores. Sooner deadlines and higher priority get the better slots; study and projects can split across gaps.",

    /* ── Day tab: labels inside rows ── */
    "label.wake":          "Wake",
    "label.windDown":      "Wind down",
    "label.what":          "What",
    "label.start":         "Start",
    "label.end":           "End",
    "label.meal":          "Meal",
    "label.time":          "Time",
    "label.min":           "Min",
    "label.task":          "Task",
    "label.minutes":       "Minutes",
    "label.type":          "Type",
    "label.priority":      "Priority",
    "label.dueInDays":     "Due in (days)",
    "label.freeMeal":      "Free meal / No time to cook",
    "label.cookDays":      "Cook days:",

    /* ── Day tab: buttons ── */
    "btn.addFixed":        "+ Add class or work block",
    "btn.scanTimetable":   "📷 Scan / attach timetable",
    "btn.addMeal":         "+ Add meal",
    "btn.addTask":         "+ Add task",
    "btn.planDay":         "Plan my day",
    "btn.reset":           "Reset",

    /* ── Day tab: output / summary ── */
    "out.summary":         "Summary",
    "out.free":            "Free",
    "out.requested":       "Requested",
    "out.scheduled":       "Scheduled",
    "out.yourDay":         "Your day",

    /* ── Legend labels ── */
    "legend.fixed":        "Fixed",
    "legend.meal":         "Meal",
    "legend.study":        "Study",
    "legend.project":      "Project",
    "legend.chore":        "Chore",
    "legend.free":         "Free",

    /* ── Timeline / verdict ── */
    "timeline.empty":      "Add your day, then press Plan my day.",
    "verdict.fits":        "Everything fits",
    "verdict.overBy":      "Over by",
    "verdict.trimHint":    "— trim a task, extend your day, or push lower-priority items.",
    "verdict.soonest":     "Soonest deadline:",
    "verdict.today":       "today",
    "tray.didntFit":       "Didn't fit",
    "day.noDay":           "No day to show yet.",

    /* ── Export ── */
    "export.dayLabel":     "Plain-text plan (copy to paste anywhere)",

    /* ── Shopping tab ── */
    "shop.priceMode.title":"How you enter prices",
    "shop.priceMode.hint": "Shelf tags in Japan usually show the tax-included price (税込). Pick which you're typing — alcohol and non-food count as \"Other\" (10%).",
    "shop.taxExcl":        "Tax-excluded 税抜",
    "shop.taxIncl":        "Tax-included 税込",
    "shop.list.title":     "Shopping list",
    "shop.list.hint":      "Quantity × unit price, per item. Tick the box as each goes in your basket to see what's still left to pay.",
    "shop.breakdown.title":"Cost breakdown",
    "label.qty":           "Qty",
    "label.unitYen":       "Unit {cur}",
    "label.itemType":      "Type",
    "shop.cat.food":       "Food 8%",
    "shop.cat.other":      "Other 10%",
    "shop.subtotal":       "Subtotal 税抜",
    "shop.items":          "Items",
    "shop.tax8":           "Tax 8% · food",
    "shop.tax10":          "Tax 10% · other",
    "shop.total":          "Total 税込",
    "shop.stillToBuy":     "Still to buy (unticked)",
    "shop.export.label":   "Plain-text list (copy to paste anywhere)",
    "btn.addItem":         "+ Add item",
    "btn.resetList":       "Reset list",

    /* ── Week tab ── */
    "week.goals.title":    "Goals — what you're working toward",
    "week.goals.hint":     "Set a weekly hour target per goal. The planner schedules these first, as protected study blocks, before other tasks. This is the part a timetable photo can't tell it — only you can.",
    "week.yourWeek.title": "Your week",
    "week.yourWeek.hint":  "Built from your day window, the weekdays each class/shift repeats on, your meals, and your tasks — spread across the next 7 days by deadline and priority.",
    "week.goalProgress":   "Goal progress this week",
    "week.timeline.title": "7-day timeline",
    "week.timeline.empty": "Press Plan my week.",
    "week.goalEmpty":      "Add a goal to see its weekly hours.",
    "btn.planWeek":        "Plan my week",
    "btn.addGoal":         "+ Add a goal",
    "week.nothingSched":   "Nothing scheduled.",
    "week.free":           "free",
    "week.today":          "TODAY",
    "week.didntFit":       "Didn't fit this week",
    "label.goal":          "Goal",
    "label.hoursPerWeek":  "Hours / week",

    /* ── Meals tab ── */
    "meals.pantry.title":  "Pantry — what you already have",
    "meals.pantry.hint":   "Staples here are skipped when generating the shopping list. Add or remove to match your kitchen.",
    "meals.pantry.ph":     "e.g. Eggs",
    "meals.pantry.btn":    "Add",
    "meals.pantryEmpty":   "Empty pantry — every ingredient will be added to shopping.",
    "meals.recipes.title": "Recipe library",
    "meals.recipes.hint":  "Tap to add a meal to this week. You can also build your own meals here.",
    "meals.mealName.ph":   "Meal Name (e.g. Avocado Toast)",
    "meals.ingredients.ph":"Ingredients (one per line or comma separated)",
    "meals.instructions.ph":"Cooking Instructions (one step per line)",
    "meals.recipeLink.ph": "Recipe Link (optional)",
    "btn.addCustomMeal":   "Add",
    "meals.aiImport.title":"🤖 Import recipes from AI",
    "meals.aiImport.hint": "Copy this prompt to your personal AI (ChatGPT, Claude, etc), then upload the JSON file it gives you.",
    "btn.copyPrompt":      "📋 Copy Prompt",
    "btn.uploadJson":      "Upload JSON",
    "meals.thisWeek.title":"This week's meals",
    "btn.suggestWeek":     "Suggest a varied week",
    "btn.clearMeals":      "Clear",
    "meals.noMeals":       "No meals yet — add some from the library or hit \"Suggest a varied week\".",
    "meals.shopList.title":"Shopping list to generate",
    "meals.shopList.hint": "Missing ingredients only (pantry staples excluded), merged across meals.",
    "meals.noMealsPicked": "No meals picked yet.",
    "meals.pantryCovers":  "Your pantry covers everything — nothing to buy!",
    "btn.addMissing":      "→ Add missing items to Shopping",
    "meals.serves":        "serves",
    "meals.viewSteps":     "View Steps",
    "meals.origLink":      "Original Link ↗",
    "meals.addLabel":      "+ Add",
    "meals.addedLabel":    "✓ Added",

    /* ── Finance tab ── */
    "fin.income.title":    "Income & balance",
    "fin.income.hint":     "What comes in this month, and what's already in your account.",
    "fin.initialBal":      "Initial account balance {cur}",
    "fin.cards.title":     "Credit cards",
    "fin.cards.hint":      "Just the name and limit — each card's spend is filled in automatically from purchases you mark as paid by it.",
    "fin.expenses.title":  "Expenses",
    "fin.expenses.hint":   "Rent, phone, transport — any expense. Pick how each was paid.",
    "fin.netSavings.title":"Net savings",
    "fin.hero.lbl":        "Income + balance − all spending",
    "fin.hero.hint":       "Add income and expenses to see where you stand.",
    "fin.income.stat":     "Income",
    "fin.totalSpend":      "Total spend",
    "fin.cashOnHand":      "Cash on hand",
    "fin.cardUtil.title":  "Card utilisation",
    "fin.noCards":         "No cards yet.",
    "fin.whereItGoes":     "Where it goes",
    "fin.export.label":    "Plain-text summary (copy to paste anywhere)",
    "label.source":        "Source",
    "label.perMonth":      "{cur} / month",
    "label.cardName":      "Card name",
    "label.limitYen":      "Limit {cur}",
    "label.paidWith":      "Paid with",
    "label.expType":       "Type",
    "fin.cat.fixed":       "Fixed",
    "fin.cat.variable":    "Variable",
    "fin.payer.cash":      "Cash / bank",
    "btn.addIncome":       "+ Add income source",
    "btn.addCard":         "+ Add card",
    "btn.addExpense":      "+ Add expense",

    /* ── Recipe modal ── */
    "recipe.ingredients":  "Ingredients",
    "recipe.instructions": "Instructions",
    "recipe.openLink":     "Open Original Recipe ↗",
    "btn.close":           "Close",

    /* ── Time picker ── */
    "timepicker.cancel":   "Cancel",
    "timepicker.set":      "Set",

    /* ── Aria labels ── */
    "aria.themeToggle":    "Toggle dark mode",
    "aria.account":        "Account",
    "aria.remove":         "Remove",
    "aria.removeTask":     "Remove task",
    "aria.removeItem":     "Remove item",
    "aria.markInBasket":   "Mark as in basket",
    "aria.itemName":       "Item name",
    "aria.pantryInput":    "Add pantry staple",
    "aria.mealName":       "Meal Name",
    "aria.ingredients":    "Ingredients",
    "aria.instructions":   "Instructions",
    "aria.recipeLink":     "Recipe Link",
    "aria.aiPrompt":       "AI recipe prompt to copy",

    /* ── Persistence status ── */
    "status.synced":       "✓ synced",
    "status.savedLocally": "saved locally",
    "status.saved":        "saved",
    "status.notSaved":     "not saved",

    /* ── Task category / priority options ── */
    "opt.study":           "Study",
    "opt.project":         "Project",
    "opt.chore":           "Chore",
    "opt.high":            "High",
    "opt.medium":          "Medium",
    "opt.low":             "Low",
  },

  /* ------------------------------------------------------------------ */
  ja: {
    /* ── App chrome ── */
    "app.title":           "日課プランナー",
    "app.tagline":         "固定の予定を入力し、やることをリストアップ — 本当のスケジュールと自由時間を確認しよう。",
    "app.footer":          "クラウドに保存 · ビルド不要 · 東京の日常生活のために",

    /* ── Header readouts ── */
    "readout.freeToday":   "今日の空き時間",
    "readout.planToCalc":  "プランを立てて計算",
    "readout.totalTaxIncl":"合計（税込）",
    "readout.netSavings":  "純貯蓄額",
    "readout.freeWeek":    "今週の空き時間",
    "readout.sevenDay":    "7日間プラン",
    "readout.toBuyMeals":  "食材の購入数",
    "readout.pickRecipes": "レシピを選ぶ",

    /* ── User menu / account ── */
    "menu.importJson":     "JSONをインポート",
    "menu.exportJson":     "JSONをエクスポート",
    "menu.signOut":        "サインアウト",
    "menu.signIn":         "Googleでサインイン",

    /* ── Tab bar ── */
    "tab.day":             "今日",
    "tab.week":            "今週",
    "tab.month":           "今月",
    "tab.shopping":        "買い物",
    "tab.meals":           "食事",
    "tab.finance":         "家計",

    /* ── Day tab: section headings ── */
    "day.sec1.title":      "活動時間帯",
    "day.sec1.hint":       "起きている時間帯です。すべての予定はこの中に組み込まれます。",
    "day.sec2.title":      "固定ブロック",
    "day.sec2.hint":       "授業やアルバイトなどです。繰り返す曜日にチェックを入れると「今週」タブに反映されます。",
    "day.sec3.title":      "食事",
    "day.sec3.hint":       "準備と食事の時間です。タスクが食事時間に被らないようスロットを確保します。",
    "day.sec4.title":      "こなすタスク",
    "day.sec4.hint":       "勉強・コーディング・家事など。締め切りが近く優先度が高いものから良い時間帯に入ります。勉強とプロジェクトは空き時間に分割できます。",

    /* ── Day tab: labels inside rows ── */
    "label.wake":          "起床",
    "label.windDown":      "就寝準備",
    "label.what":          "内容",
    "label.start":         "開始",
    "label.end":           "終了",
    "label.meal":          "食事",
    "label.time":          "時間",
    "label.min":           "分",
    "label.task":          "タスク",
    "label.minutes":       "分数",
    "label.type":          "種類",
    "label.priority":      "優先度",
    "label.dueInDays":     "期限（日後）",
    "label.freeMeal":      "外食 / 自炊なし",
    "label.cookDays":      "自炊する日:",

    /* ── Day tab: buttons ── */
    "btn.addFixed":        "+ 授業・仕事を追加",
    "btn.scanTimetable":   "📷 時間割を読み込む",
    "btn.addMeal":         "+ 食事を追加",
    "btn.addTask":         "+ タスクを追加",
    "btn.planDay":         "今日のプランを作成",
    "btn.reset":           "リセット",

    /* ── Day tab: output / summary ── */
    "out.summary":         "サマリー",
    "out.free":            "空き",
    "out.requested":       "要求合計",
    "out.scheduled":       "スケジュール済み",
    "out.yourDay":         "今日のスケジュール",

    /* ── Legend labels ── */
    "legend.fixed":        "固定",
    "legend.meal":         "食事",
    "legend.study":        "勉強",
    "legend.project":      "プロジェクト",
    "legend.chore":        "家事",
    "legend.free":         "自由時間",

    /* ── Timeline / verdict ── */
    "timeline.empty":      "予定を入力して「今日のプランを作成」を押してください。",
    "verdict.fits":        "すべて収まります",
    "verdict.overBy":      "オーバー",
    "verdict.trimHint":    "— タスクを減らすか、活動時間を延ばすか、優先度の低いものを後回しにしてください。",
    "verdict.soonest":     "最短締め切り:",
    "verdict.today":       "今日",
    "tray.didntFit":       "収まらなかったタスク",
    "day.noDay":           "まだ表示するスケジュールがありません。",

    /* ── Export ── */
    "export.dayLabel":     "テキスト形式のプラン（コピーして貼り付け）",

    /* ── Shopping tab ── */
    "shop.priceMode.title":"価格の入力方法",
    "shop.priceMode.hint": "日本の値札は通常、税込価格（税込）で表示されます。どちらの価格を入力するか選択してください。酒類・食品以外は「その他」（10%）です。",
    "shop.taxExcl":        "税抜価格で入力",
    "shop.taxIncl":        "税込価格で入力",
    "shop.list.title":     "買い物リスト",
    "shop.list.hint":      "1品ごとに個数×単価を入力します。カゴに入れたらチェックを入れると残額が確認できます。",
    "shop.breakdown.title":"費用内訳",
    "label.qty":           "個数",
    "label.unitYen":       "単価（{cur}）",
    "label.itemType":      "種類",
    "shop.cat.food":       "食品 8%",
    "shop.cat.other":      "その他 10%",
    "shop.subtotal":       "小計（税抜）",
    "shop.items":          "品数",
    "shop.tax8":           "消費税 8%（食品）",
    "shop.tax10":          "消費税 10%（その他）",
    "shop.total":          "合計（税込）",
    "shop.stillToBuy":     "未購入（未チェック）",
    "shop.export.label":   "テキスト形式のリスト（コピーして貼り付け）",
    "btn.addItem":         "+ 商品を追加",
    "btn.resetList":       "リストをリセット",

    /* ── Week tab ── */
    "week.goals.title":    "目標 — 取り組んでいること",
    "week.goals.hint":     "目標ごとに週間の目標時間を設定します。プランナーはこれを最優先に、保護された勉強ブロックとして確保します。これは時間割の写真では分からない情報です。",
    "week.yourWeek.title": "今週のスケジュール",
    "week.yourWeek.hint":  "活動時間帯・授業や仕事の繰り返し曜日・食事・タスクを基に、締め切りと優先度に従って次の7日間に分散します。",
    "week.goalProgress":   "今週の目標進捗",
    "week.timeline.title": "7日間タイムライン",
    "week.timeline.empty": "「今週のプランを作成」を押してください。",
    "week.goalEmpty":      "目標を追加すると週間時間が表示されます。",
    "btn.planWeek":        "今週のプランを作成",
    "btn.addGoal":         "+ 目標を追加",
    "week.nothingSched":   "予定なし。",
    "week.free":           "空き",
    "week.today":          "今日",
    "week.didntFit":       "今週に収まらなかったタスク",
    "label.goal":          "目標",
    "label.hoursPerWeek":  "時間 / 週",

    /* ── Meals tab ── */
    "meals.pantry.title":  "パントリー — 手持ちの食材",
    "meals.pantry.hint":   "ここに登録した食材は買い物リスト生成時に除外されます。キッチンの在庫に合わせて追加・削除してください。",
    "meals.pantry.ph":     "例：卵",
    "meals.pantry.btn":    "追加",
    "meals.pantryEmpty":   "パントリーが空です — すべての食材が買い物リストに追加されます。",
    "meals.recipes.title": "レシピライブラリ",
    "meals.recipes.hint":  "タップして今週の食事に追加できます。自分でレシピを作成することもできます。",
    "meals.mealName.ph":   "食事名（例：アボカドトースト）",
    "meals.ingredients.ph":"食材（1行に1つまたはカンマ区切り）",
    "meals.instructions.ph":"調理手順（1行に1ステップ）",
    "meals.recipeLink.ph": "レシピリンク（任意）",
    "btn.addCustomMeal":   "追加",
    "meals.aiImport.title":"🤖 AIからレシピをインポート",
    "meals.aiImport.hint": "このプロンプトをAI（ChatGPT・Claudeなど）にコピーし、返ってきたJSONファイルをアップロードしてください。",
    "btn.copyPrompt":      "📋 プロンプトをコピー",
    "btn.uploadJson":      "JSONをアップロード",
    "meals.thisWeek.title":"今週の食事",
    "btn.suggestWeek":     "バランスの良い1週間を提案",
    "btn.clearMeals":      "クリア",
    "meals.noMeals":       "まだ食事が登録されていません — ライブラリから追加するか「バランスの良い1週間を提案」を押してください。",
    "meals.shopList.title":"買い物リスト生成",
    "meals.shopList.hint": "不足食材のみ（パントリー在庫を除く）、複数の食事をまとめて表示します。",
    "meals.noMealsPicked": "まだ食事が選ばれていません。",
    "meals.pantryCovers":  "パントリーですべてまかなえます — 購入するものはありません！",
    "btn.addMissing":      "→ 不足食材を買い物リストへ",
    "meals.serves":        "人前",
    "meals.viewSteps":     "手順を見る",
    "meals.origLink":      "元のレシピを開く ↗",
    "meals.addLabel":      "+ 追加",
    "meals.addedLabel":    "✓ 追加済み",

    /* ── Finance tab ── */
    "fin.income.title":    "収入と残高",
    "fin.income.hint":     "今月の収入と口座の残高を入力します。",
    "fin.initialBal":      "口座残高（{cur}）",
    "fin.cards.title":     "クレジットカード",
    "fin.cards.hint":      "カード名と利用限度額だけ入力 — そのカードで支払った購入額が自動で集計されます。",
    "fin.expenses.title":  "支出",
    "fin.expenses.hint":   "家賃・携帯料金・交通費など、あらゆる支出を入力してください。支払い方法を選択してください。",
    "fin.netSavings.title":"純貯蓄額",
    "fin.hero.lbl":        "収入 ＋ 残高 − 総支出",
    "fin.hero.hint":       "収入と支出を入力すると状況が表示されます。",
    "fin.income.stat":     "収入",
    "fin.totalSpend":      "総支出",
    "fin.cashOnHand":      "手元現金",
    "fin.cardUtil.title":  "カード利用率",
    "fin.noCards":         "カードがまだありません。",
    "fin.whereItGoes":     "支出の内訳",
    "fin.export.label":    "テキスト形式のサマリー（コピーして貼り付け）",
    "label.source":        "収入源",
    "label.perMonth":      "{cur} / 月",
    "label.cardName":      "カード名",
    "label.limitYen":      "限度額（{cur}）",
    "label.paidWith":      "支払い方法",
    "label.expType":       "種類",
    "fin.cat.fixed":       "固定費",
    "fin.cat.variable":    "変動費",
    "fin.payer.cash":      "現金 / 銀行",
    "btn.addIncome":       "+ 収入を追加",
    "btn.addCard":         "+ カードを追加",
    "btn.addExpense":      "+ 支出を追加",

    /* ── Recipe modal ── */
    "recipe.ingredients":  "食材",
    "recipe.instructions": "調理手順",
    "recipe.openLink":     "元のレシピを開く ↗",
    "btn.close":           "閉じる",

    /* ── Time picker ── */
    "timepicker.cancel":   "キャンセル",
    "timepicker.set":      "確定",

    /* ── Aria labels ── */
    "aria.themeToggle":    "ダークモード切替",
    "aria.account":        "アカウント",
    "aria.remove":         "削除",
    "aria.removeTask":     "タスクを削除",
    "aria.removeItem":     "商品を削除",
    "aria.markInBasket":   "カゴに入れる",
    "aria.itemName":       "商品名",
    "aria.pantryInput":    "食材を追加",
    "aria.mealName":       "食事名",
    "aria.ingredients":    "食材",
    "aria.instructions":   "調理手順",
    "aria.recipeLink":     "レシピリンク",
    "aria.aiPrompt":       "AIに渡すプロンプト",

    /* ── Persistence status ── */
    "status.synced":       "✓ 同期済み",
    "status.savedLocally": "ローカルに保存",
    "status.saved":        "保存済み",
    "status.notSaved":     "未保存",

    /* ── Task category / priority options ── */
    "opt.study":           "勉強",
    "opt.project":         "プロジェクト",
    "opt.chore":           "家事",
    "opt.high":            "高",
    "opt.medium":          "中",
    "opt.low":             "低",
  },

  /* ------------------------------------------------------------------ */
  vi: {
    /* ── App chrome ── */
    "app.title":           "Lịch Ngày",
    "app.tagline":         "Nhập lịch cố định, liệt kê việc cần làm — xem lịch thực tế và thời gian rảnh của bạn.",
    "app.footer":          "Lưu trên đám mây · không cần build · xây dựng cho cuộc sống hàng ngày tại Tokyo",

    /* ── Header readouts ── */
    "readout.freeToday":   "Thời gian rảnh hôm nay",
    "readout.planToCalc":  "lập kế hoạch để tính",
    "readout.totalTaxIncl":"Tổng cộng (đã có thuế)",
    "readout.netSavings":  "Tiết kiệm ròng",
    "readout.freeWeek":    "Rảnh tuần này",
    "readout.sevenDay":    "Kế hoạch 7 ngày",
    "readout.toBuyMeals":  "Cần mua cho bữa ăn",
    "readout.pickRecipes": "chọn công thức",

    /* ── User menu / account ── */
    "menu.importJson":     "Nhập JSON",
    "menu.exportJson":     "Xuất JSON",
    "menu.signOut":        "Đăng xuất",
    "menu.signIn":         "Đăng nhập bằng Google",

    /* ── Tab bar ── */
    "tab.day":             "Hôm nay",
    "tab.week":            "Tuần này",
    "tab.month":           "Tháng này",
    "tab.shopping":        "Mua sắm",
    "tab.meals":           "Bữa ăn",
    "tab.finance":         "Tài chính",

    /* ── Day tab: section headings ── */
    "day.sec1.title":      "Khung giờ hoạt động",
    "day.sec1.hint":       "Khoảng thời gian bạn thức và có thể liên lạc. Mọi lịch đều được sắp xếp trong khoảng này.",
    "day.sec2.title":      "Lịch cố định",
    "day.sec2.hint":       "Lớp học và công việc bán thời gian. Tích vào ngày trong tuần mà lịch đó lặp lại — điều này ảnh hưởng đến tab Tuần.",
    "day.sec3.title":      "Bữa ăn",
    "day.sec3.hint":       "Thời gian nấu và ăn. Các bữa ăn sẽ giữ chỗ để công việc không bị xếp vào giờ đó.",
    "day.sec4.title":      "Công việc cần hoàn thành",
    "day.sec4.hint":       "Học, dự án lập trình, việc nhà. Deadline gần và ưu tiên cao hơn sẽ được xếp vào khung giờ tốt hơn; học và dự án có thể chia nhỏ vào các khoảng trống.",

    /* ── Day tab: labels inside rows ── */
    "label.wake":          "Thức dậy",
    "label.windDown":      "Chuẩn bị ngủ",
    "label.what":          "Nội dung",
    "label.start":         "Bắt đầu",
    "label.end":           "Kết thúc",
    "label.meal":          "Bữa ăn",
    "label.time":          "Giờ",
    "label.min":           "Phút",
    "label.task":          "Công việc",
    "label.minutes":       "Số phút",
    "label.type":          "Loại",
    "label.priority":      "Ưu tiên",
    "label.dueInDays":     "Deadline (ngày nữa)",
    "label.freeMeal":      "Bữa tự do / Không nấu",
    "label.cookDays":      "Ngày nấu ăn:",

    /* ── Day tab: buttons ── */
    "btn.addFixed":        "+ Thêm lớp hoặc ca làm",
    "btn.scanTimetable":   "📷 Quét / đính kèm thời khóa biểu",
    "btn.addMeal":         "+ Thêm bữa ăn",
    "btn.addTask":         "+ Thêm công việc",
    "btn.planDay":         "Lập kế hoạch ngày",
    "btn.reset":           "Đặt lại",

    /* ── Day tab: output / summary ── */
    "out.summary":         "Tổng kết",
    "out.free":            "Rảnh",
    "out.requested":       "Yêu cầu",
    "out.scheduled":       "Đã xếp lịch",
    "out.yourDay":         "Lịch của bạn",

    /* ── Legend labels ── */
    "legend.fixed":        "Cố định",
    "legend.meal":         "Bữa ăn",
    "legend.study":        "Học",
    "legend.project":      "Dự án",
    "legend.chore":        "Việc nhà",
    "legend.free":         "Thời gian rảnh",

    /* ── Timeline / verdict ── */
    "timeline.empty":      "Nhập lịch của bạn rồi nhấn Lập kế hoạch ngày.",
    "verdict.fits":        "Tất cả vừa khít",
    "verdict.overBy":      "Vượt quá",
    "verdict.trimHint":    "— bớt công việc, kéo dài ngày, hoặc dời việc ưu tiên thấp sang hôm khác.",
    "verdict.soonest":     "Deadline gần nhất:",
    "verdict.today":       "hôm nay",
    "tray.didntFit":       "Không xếp được",
    "day.noDay":           "Chưa có lịch để hiển thị.",

    /* ── Export ── */
    "export.dayLabel":     "Kế hoạch dạng văn bản (sao chép để dán vào nơi khác)",

    /* ── Shopping tab ── */
    "shop.priceMode.title":"Cách nhập giá",
    "shop.priceMode.hint": "Thẻ giá ở Nhật thường hiển thị giá đã có thuế (税込). Chọn loại giá bạn đang nhập — rượu và đồ không phải thực phẩm tính là \"Khác\" (10%).",
    "shop.taxExcl":        "Giá chưa thuế 税抜",
    "shop.taxIncl":        "Giá đã có thuế 税込",
    "shop.list.title":     "Danh sách mua sắm",
    "shop.list.hint":      "Số lượng × đơn giá cho mỗi mặt hàng. Tích vào ô khi đã bỏ vào giỏ để xem còn cần trả bao nhiêu.",
    "shop.breakdown.title":"Chi tiết chi phí",
    "label.qty":           "Số lượng",
    "label.unitYen":       "Đơn giá {cur}",
    "label.itemType":      "Loại",
    "shop.cat.food":       "Thực phẩm 8%",
    "shop.cat.other":      "Khác 10%",
    "shop.subtotal":       "Tạm tính (chưa thuế)",
    "shop.items":          "Mặt hàng",
    "shop.tax8":           "Thuế 8% · thực phẩm",
    "shop.tax10":          "Thuế 10% · khác",
    "shop.total":          "Tổng cộng (đã thuế)",
    "shop.stillToBuy":     "Còn cần mua (chưa tích)",
    "shop.export.label":   "Danh sách dạng văn bản (sao chép để dán vào nơi khác)",
    "btn.addItem":         "+ Thêm mặt hàng",
    "btn.resetList":       "Đặt lại danh sách",

    /* ── Week tab ── */
    "week.goals.title":    "Mục tiêu — những gì bạn đang hướng đến",
    "week.goals.hint":     "Đặt mục tiêu số giờ mỗi tuần cho từng mục tiêu. Ứng dụng sẽ ưu tiên xếp các mục tiêu này trước, như những khối học được bảo vệ. Đây là thông tin mà ảnh thời khóa biểu không thể nói lên.",
    "week.yourWeek.title": "Tuần của bạn",
    "week.yourWeek.hint":  "Xây dựng từ khung giờ hoạt động, ngày lặp lại của lớp/ca làm, bữa ăn và công việc — phân bổ trong 7 ngày tới theo deadline và mức ưu tiên.",
    "week.goalProgress":   "Tiến độ mục tiêu tuần này",
    "week.timeline.title": "Lịch 7 ngày",
    "week.timeline.empty": "Nhấn Lập kế hoạch tuần.",
    "week.goalEmpty":      "Thêm mục tiêu để xem số giờ hàng tuần.",
    "btn.planWeek":        "Lập kế hoạch tuần",
    "btn.addGoal":         "+ Thêm mục tiêu",
    "week.nothingSched":   "Không có lịch.",
    "week.free":           "rảnh",
    "week.today":          "HÔM NAY",
    "week.didntFit":       "Không xếp được trong tuần",
    "label.goal":          "Mục tiêu",
    "label.hoursPerWeek":  "Giờ / tuần",

    /* ── Meals tab ── */
    "meals.pantry.title":  "Tủ bếp — những gì bạn đã có",
    "meals.pantry.hint":   "Nguyên liệu ở đây sẽ được bỏ qua khi tạo danh sách mua sắm. Thêm hoặc xóa để phù hợp với tủ bếp của bạn.",
    "meals.pantry.ph":     "Ví dụ: Trứng",
    "meals.pantry.btn":    "Thêm",
    "meals.pantryEmpty":   "Tủ bếp trống — tất cả nguyên liệu sẽ được thêm vào danh sách mua sắm.",
    "meals.recipes.title": "Thư viện công thức",
    "meals.recipes.hint":  "Nhấn để thêm bữa ăn vào tuần này. Bạn cũng có thể tạo bữa ăn của riêng mình.",
    "meals.mealName.ph":   "Tên bữa ăn (ví dụ: Bánh mì bơ bơ)",
    "meals.ingredients.ph":"Nguyên liệu (mỗi dòng một loại hoặc phân cách bằng dấu phẩy)",
    "meals.instructions.ph":"Hướng dẫn nấu ăn (mỗi dòng một bước)",
    "meals.recipeLink.ph": "Liên kết công thức (không bắt buộc)",
    "btn.addCustomMeal":   "Thêm",
    "meals.aiImport.title":"🤖 Nhập công thức từ AI",
    "meals.aiImport.hint": "Sao chép prompt này vào AI cá nhân của bạn (ChatGPT, Claude, v.v.), rồi tải lên file JSON mà AI trả về.",
    "btn.copyPrompt":      "📋 Sao chép Prompt",
    "btn.uploadJson":      "Tải lên JSON",
    "meals.thisWeek.title":"Bữa ăn tuần này",
    "btn.suggestWeek":     "Gợi ý thực đơn đa dạng cả tuần",
    "btn.clearMeals":      "Xóa",
    "meals.noMeals":       "Chưa có bữa ăn — thêm từ thư viện hoặc nhấn \"Gợi ý thực đơn đa dạng cả tuần\".",
    "meals.shopList.title":"Tạo danh sách mua sắm",
    "meals.shopList.hint": "Chỉ những nguyên liệu còn thiếu (không tính nguyên liệu trong tủ bếp), gộp từ tất cả các bữa.",
    "meals.noMealsPicked": "Chưa chọn bữa ăn nào.",
    "meals.pantryCovers":  "Tủ bếp đã có đủ mọi thứ — không cần mua thêm gì!",
    "btn.addMissing":      "→ Thêm nguyên liệu còn thiếu vào Mua sắm",
    "meals.serves":        "khẩu phần",
    "meals.viewSteps":     "Xem các bước",
    "meals.origLink":      "Mở công thức gốc ↗",
    "meals.addLabel":      "+ Thêm",
    "meals.addedLabel":    "✓ Đã thêm",

    /* ── Finance tab ── */
    "fin.income.title":    "Thu nhập & số dư",
    "fin.income.hint":     "Thu nhập tháng này và số tiền đã có trong tài khoản.",
    "fin.initialBal":      "Số dư tài khoản ban đầu {cur}",
    "fin.cards.title":     "Thẻ tín dụng",
    "fin.cards.hint":      "Chỉ cần tên và hạn mức — chi tiêu của mỗi thẻ sẽ được tự động tổng hợp từ các giao dịch bạn đánh dấu trả bằng thẻ đó.",
    "fin.expenses.title":  "Chi tiêu",
    "fin.expenses.hint":   "Tiền thuê nhà, điện thoại, đi lại — mọi khoản chi tiêu. Chọn hình thức thanh toán cho từng khoản.",
    "fin.netSavings.title":"Tiết kiệm ròng",
    "fin.hero.lbl":        "Thu nhập + số dư − tổng chi tiêu",
    "fin.hero.hint":       "Thêm thu nhập và chi tiêu để xem tình hình tài chính.",
    "fin.income.stat":     "Thu nhập",
    "fin.totalSpend":      "Tổng chi tiêu",
    "fin.cashOnHand":      "Tiền mặt trong tay",
    "fin.cardUtil.title":  "Mức sử dụng thẻ",
    "fin.noCards":         "Chưa có thẻ nào.",
    "fin.whereItGoes":     "Chi tiêu đi đâu",
    "fin.export.label":    "Tóm tắt dạng văn bản (sao chép để dán vào nơi khác)",
    "label.source":        "Nguồn thu",
    "label.perMonth":      "{cur} / tháng",
    "label.cardName":      "Tên thẻ",
    "label.limitYen":      "Hạn mức {cur}",
    "label.paidWith":      "Thanh toán bằng",
    "label.expType":       "Loại",
    "fin.cat.fixed":       "Cố định",
    "fin.cat.variable":    "Biến đổi",
    "fin.payer.cash":      "Tiền mặt / ngân hàng",
    "btn.addIncome":       "+ Thêm nguồn thu",
    "btn.addCard":         "+ Thêm thẻ",
    "btn.addExpense":      "+ Thêm chi tiêu",

    /* ── Recipe modal ── */
    "recipe.ingredients":  "Nguyên liệu",
    "recipe.instructions": "Hướng dẫn",
    "recipe.openLink":     "Mở công thức gốc ↗",
    "btn.close":           "Đóng",

    /* ── Time picker ── */
    "timepicker.cancel":   "Hủy",
    "timepicker.set":      "Đặt",

    /* ── Aria labels ── */
    "aria.themeToggle":    "Bật/tắt chế độ tối",
    "aria.account":        "Tài khoản",
    "aria.remove":         "Xóa",
    "aria.removeTask":     "Xóa công việc",
    "aria.removeItem":     "Xóa mặt hàng",
    "aria.markInBasket":   "Đánh dấu đã bỏ vào giỏ",
    "aria.itemName":       "Tên mặt hàng",
    "aria.pantryInput":    "Thêm nguyên liệu tủ bếp",
    "aria.mealName":       "Tên bữa ăn",
    "aria.ingredients":    "Nguyên liệu",
    "aria.instructions":   "Hướng dẫn",
    "aria.recipeLink":     "Liên kết công thức",
    "aria.aiPrompt":       "Prompt AI để sao chép",

    /* ── Persistence status ── */
    "status.synced":       "✓ Đã đồng bộ",
    "status.savedLocally": "Đã lưu cục bộ",
    "status.saved":        "Đã lưu",
    "status.notSaved":     "Chưa lưu",

    /* ── Task category / priority options ── */
    "opt.study":           "Học",
    "opt.project":         "Dự án",
    "opt.chore":           "Việc nhà",
    "opt.high":            "Cao",
    "opt.medium":          "Trung bình",
    "opt.low":             "Thấp",
  },
};

/* =============================================================================
   Engine
============================================================================= */

const SUPPORTED = ["en", "ja", "vi"];

/**
 * Return the active language code.
 * Priority: localStorage["lang"] > navigator.language prefix > "en"
 */
export function getLang() {
  try {
    const stored = localStorage.getItem("lang");
    if (stored && SUPPORTED.includes(stored)) return stored;
  } catch (_) { /* localStorage unavailable */ }
  const nav = (typeof navigator !== "undefined" && navigator.language || "").slice(0, 2).toLowerCase();
  return SUPPORTED.includes(nav) ? nav : "en";
}

/**
 * Persist the chosen language to localStorage and return it.
 */
export function setLang(lang) {
  const code = SUPPORTED.includes(lang) ? lang : "en";
  try { localStorage.setItem("lang", code); } catch (_) { /* ignore */ }
  return code;
}

/**
 * Translate a key.
 * Falls back: requested lang → en → the key itself (so missing keys are visible).
 */
export function t(key, lang) {
  const l = lang || getLang();
  let str = (MESSAGES[l] && MESSAGES[l][key])
      || (MESSAGES["en"] && MESSAGES["en"][key])
      || key;
  return str.replace(/\{cur\}/g, currentCurrency);
}

/**
 * Walk the DOM and apply translations.
 *   [data-i18n]       → el.textContent
 *   [data-i18n-ph]    → el.placeholder
 *   [data-i18n-aria]  → el.setAttribute("aria-label", …)
 *
 * Also sets document.documentElement.lang.
 * Safe to call when document is undefined (SSR / test environments).
 */
export function applyLanguage(lang, root) {
  if (typeof document === "undefined") return;
  const l = lang || getLang();
  const r = root || document;

  r.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    // special dynamic key: show the live currency symbol, not a dictionary lookup
    el.textContent = key === "sym.currency" ? getCurrency() : t(key, l);
  });

  r.querySelectorAll("[data-i18n-ph]").forEach(el => {
    const key = el.dataset.i18nPh;
    el.placeholder = t(key, l);
  });

  r.querySelectorAll("[data-i18n-aria]").forEach(el => {
    const key = el.dataset.i18nAria;
    el.setAttribute("aria-label", t(key, l));
  });

  try {
    document.documentElement.lang = l;
  } catch (_) { /* ignore */ }
}

/**
 * Returns the list of available languages with human-readable labels.
 */
export function availableLanguages() {
  return [
    { code: "en", label: "English" },
    { code: "ja", label: "日本語" },
    { code: "vi", label: "Tiếng Việt" },
  ];
}
