/**
 * The strings this app shows, in the three languages the desk app offers.
 *
 * Same approach as `apps/web/src/lib/i18n/` — a flat dictionary rather than a
 * library, because there are eighty strings here and a locale layer would be
 * more code than the thing it translates. The terms are taken from the desk
 * app's dictionary on purpose: a manager who reads "A'zolar" on the terminal
 * must not read "Mijozlar" on the phone for the same list.
 *
 * Uzbek is the default, as on the desk.
 */

import { NativeModules, Platform } from "react-native";

export const LOCALES = [
  { code: "uz", label: "O'zbekcha" },
  { code: "ru", label: "Русский" },
  { code: "en", label: "English" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const DEFAULT_LOCALE: Locale = "uz";

const UZ = {
  "nav.home": "Bosh sahifa",
  "nav.members": "A'zolar",
  "nav.staff": "Xodimlar",
  "nav.attendance": "Davomat",
  "nav.storage": "Ombor",

  "auth.title": "Kirish",
  "auth.subtitle": "Zal boshqaruvi",
  "auth.phone": "Telefon",
  "auth.password": "Parol",
  "auth.submit": "Kirish",
  "auth.invalid": "Telefon yoki parol noto'g'ri",
  "auth.tooMany": "Juda ko'p urinish. Biroz kuting.",
  "auth.offline": "Serverga ulanib bo'lmadi",
  "auth.phoneRequired": "Telefon raqamini kiriting",
  "auth.phoneIncomplete": "Raqam to'liq emas",
  "auth.passwordRequired": "Parolni kiriting",
  "auth.country": "Davlat",

  "boot.offline": "Serverga ulanib bo'lmadi",
  "boot.offlineHint": "Internetni tekshiring va qayta urining",
  "boot.retry": "Qayta urinish",

  "home.greeting": "Salom",
  "home.income": "DAROMAD",
  "home.revenue": "Tushum",
  "home.profit": "Foyda",
  "home.expense": "Xarajat",
  "home.shopSales": "Savdo",
  "home.membershipSales": "A'zolik",
  "home.otherSales": "Boshqa",
  "home.inGym": "Hozir zalda",
  "home.membershipDebt": "A'zolik qarzi",
  "home.shopDebt": "Savdo qarzi",
  "home.supplierDebt": "Ta'minotchi qarzi",
  "home.topProducts": "Ko'p sotilgan",
  "home.standing": "A'zolar holati",
  "home.active": "Faol",
  "home.expiring": "Tugayapti",
  "home.lapsed": "Tugagan",
  "home.joined": "Yangi (oy)",
  "home.attention": "E'tibor talab qiladi",
  "home.expiringSoon": "Muddati tugayapti",
  "home.debtors": "Qarzdorlar",
  "home.lowStock": "Kam qolgan",
  "home.noChart": "Bu davrda tushum yo'q",

  "range.today": "Bugun",
  "range.week": "7 kun",
  "range.month": "30 kun",
  "range.quarter": "90 kun",

  "members.title": "A'zolar",
  "members.search": "Ism yoki telefon",
  "members.all": "Hammasi",
  "members.active": "Faol",
  "members.expiring": "Tugayapti",
  "members.inactive": "Nofaol",
  "members.debt": "Qarz",
  "members.noPlan": "Rejasiz",
  "members.visitsLeft": "ta tashrif",
  "members.until": "gacha",

  "staff.title": "Xodimlar",
  "staff.search": "Ism yoki telefon",
  "staff.activeFilter": "Faol",
  "staff.onShift": "Smenada",
  "staff.inactive": "Nofaol",
  "staff.all": "Hammasi",
  "staff.worked": "Ishlangan",
  "staff.balance": "Qoldiq",
  "staff.sinceShift": "dan beri",

  "attendance.title": "Davomat",
  "attendance.search": "Ism yoki telefon",
  "attendance.visits": "tashrif",
  "attendance.members": "a'zo",
  "attendance.lastVisit": "Oxirgi",
  "attendance.visitsLeft": "qoldi",

  "storage.title": "Ombor",
  "storage.search": "Mahsulot nomi",
  "storage.total": "Jami",
  "storage.in": "Bor",
  "storage.low": "Kam",
  "storage.out": "Tugagan",
  "storage.left": "Qoldiq",
  "storage.readOnly": "Bu ekran faqat ko'rish uchun",

  "profile.title": "Profil",
  "profile.gym": "Zal",
  "profile.branch": "Filial",
  "profile.role": "Lavozim",
  "profile.phone": "Telefon",
  "profile.language": "Til",
  "profile.signOut": "Chiqish",
  "profile.signOutConfirm": "Hisobdan chiqasizmi?",
  "profile.version": "Versiya",

  "role.owner": "Egasi",
  "role.admin": "Administrator",
  "role.manager": "Menejer",
  "role.trainer": "Murabbiy",
  "role.receptionist": "Qabulchi",

  "common.empty": "Ma'lumot yo'q",
  "common.error": "Xatolik yuz berdi",
  "common.retry": "Qayta urinish",
  "common.cancel": "Bekor qilish",
  "common.of": "/",
  "common.more": "yana",
  "common.currency": "so'm",
  "common.loading": "Yuklanmoqda",
} as const;

export type MessageKey = keyof typeof UZ;

export type Messages = Record<MessageKey, string>;

const RU: Messages = {
  "nav.home": "Главная",
  "nav.members": "Клиенты",
  "nav.staff": "Сотрудники",
  "nav.attendance": "Посещения",
  "nav.storage": "Склад",

  "auth.title": "Вход",
  "auth.subtitle": "Управление залом",
  "auth.phone": "Телефон",
  "auth.password": "Пароль",
  "auth.submit": "Войти",
  "auth.invalid": "Неверный телефон или пароль",
  "auth.tooMany": "Слишком много попыток. Подождите.",
  "auth.offline": "Не удалось связаться с сервером",
  "auth.phoneRequired": "Введите номер телефона",
  "auth.phoneIncomplete": "Номер неполный",
  "auth.passwordRequired": "Введите пароль",
  "auth.country": "Страна",

  "boot.offline": "Нет связи с сервером",
  "boot.offlineHint": "Проверьте интернет и попробуйте снова",
  "boot.retry": "Повторить",

  "home.greeting": "Здравствуйте",
  "home.income": "ДОХОД",
  "home.revenue": "Выручка",
  "home.profit": "Прибыль",
  "home.expense": "Расход",
  "home.shopSales": "Продажи",
  "home.membershipSales": "Абонементы",
  "home.otherSales": "Прочее",
  "home.inGym": "Сейчас в зале",
  "home.membershipDebt": "Долг по абонементам",
  "home.shopDebt": "Долг по продажам",
  "home.supplierDebt": "Долг поставщикам",
  "home.topProducts": "Топ продаж",
  "home.standing": "Состояние клиентов",
  "home.active": "Активные",
  "home.expiring": "Истекают",
  "home.lapsed": "Истекли",
  "home.joined": "Новые (месяц)",
  "home.attention": "Требует внимания",
  "home.expiringSoon": "Скоро истекают",
  "home.debtors": "Должники",
  "home.lowStock": "Заканчивается",
  "home.noChart": "Нет выручки за период",

  "range.today": "Сегодня",
  "range.week": "7 дней",
  "range.month": "30 дней",
  "range.quarter": "90 дней",

  "members.title": "Клиенты",
  "members.search": "Имя или телефон",
  "members.all": "Все",
  "members.active": "Активные",
  "members.expiring": "Истекают",
  "members.inactive": "Неактивные",
  "members.debt": "Долг",
  "members.noPlan": "Без абонемента",
  "members.visitsLeft": "посещений",
  "members.until": "до",

  "staff.title": "Сотрудники",
  "staff.search": "Имя или телефон",
  "staff.activeFilter": "Активные",
  "staff.onShift": "На смене",
  "staff.inactive": "Неактивные",
  "staff.all": "Все",
  "staff.worked": "Отработано",
  "staff.balance": "Остаток",
  "staff.sinceShift": "с",

  "attendance.title": "Посещения",
  "attendance.search": "Имя или телефон",
  "attendance.visits": "посещений",
  "attendance.members": "клиентов",
  "attendance.lastVisit": "Последнее",
  "attendance.visitsLeft": "осталось",

  "storage.title": "Склад",
  "storage.search": "Название товара",
  "storage.total": "Всего",
  "storage.in": "В наличии",
  "storage.low": "Мало",
  "storage.out": "Закончился",
  "storage.left": "Остаток",
  "storage.readOnly": "Экран только для просмотра",

  "profile.title": "Профиль",
  "profile.gym": "Зал",
  "profile.branch": "Филиал",
  "profile.role": "Должность",
  "profile.phone": "Телефон",
  "profile.language": "Язык",
  "profile.signOut": "Выйти",
  "profile.signOutConfirm": "Выйти из аккаунта?",
  "profile.version": "Версия",

  "role.owner": "Владелец",
  "role.admin": "Администратор",
  "role.manager": "Менеджер",
  "role.trainer": "Тренер",
  "role.receptionist": "Администратор стойки",

  "common.empty": "Нет данных",
  "common.error": "Произошла ошибка",
  "common.retry": "Повторить",
  "common.cancel": "Отмена",
  "common.of": "/",
  "common.more": "ещё",
  "common.currency": "сум",
  "common.loading": "Загрузка",
};

const EN: Messages = {
  "nav.home": "Home",
  "nav.members": "Members",
  "nav.staff": "Staff",
  "nav.attendance": "Attendance",
  "nav.storage": "Storage",

  "auth.title": "Sign in",
  "auth.subtitle": "Gym management",
  "auth.phone": "Phone",
  "auth.password": "Password",
  "auth.submit": "Sign in",
  "auth.invalid": "Wrong phone or password",
  "auth.tooMany": "Too many attempts. Wait a moment.",
  "auth.offline": "Could not reach the server",
  "auth.phoneRequired": "Enter a phone number",
  "auth.phoneIncomplete": "That number is incomplete",
  "auth.passwordRequired": "Enter your password",
  "auth.country": "Country",

  "boot.offline": "Could not reach the server",
  "boot.offlineHint": "Check your connection and try again",
  "boot.retry": "Try again",

  "home.greeting": "Hello",
  "home.income": "INCOME",
  "home.revenue": "Revenue",
  "home.profit": "Profit",
  "home.expense": "Expense",
  "home.shopSales": "Shop",
  "home.membershipSales": "Memberships",
  "home.otherSales": "Other",
  "home.inGym": "In the gym now",
  "home.membershipDebt": "Membership debt",
  "home.shopDebt": "Shop debt",
  "home.supplierDebt": "Supplier debt",
  "home.topProducts": "Top sellers",
  "home.standing": "Member standing",
  "home.active": "Active",
  "home.expiring": "Expiring",
  "home.lapsed": "Lapsed",
  "home.joined": "New this month",
  "home.attention": "Needs attention",
  "home.expiringSoon": "Expiring soon",
  "home.debtors": "Debtors",
  "home.lowStock": "Running low",
  "home.noChart": "No revenue in this period",

  "range.today": "Today",
  "range.week": "7 days",
  "range.month": "30 days",
  "range.quarter": "90 days",

  "members.title": "Members",
  "members.search": "Name or phone",
  "members.all": "All",
  "members.active": "Active",
  "members.expiring": "Expiring",
  "members.inactive": "Inactive",
  "members.debt": "Debt",
  "members.noPlan": "No plan",
  "members.visitsLeft": "visits",
  "members.until": "until",

  "staff.title": "Staff",
  "staff.search": "Name or phone",
  "staff.activeFilter": "Active",
  "staff.onShift": "On shift",
  "staff.inactive": "Inactive",
  "staff.all": "All",
  "staff.worked": "Worked",
  "staff.balance": "Balance",
  "staff.sinceShift": "since",

  "attendance.title": "Attendance",
  "attendance.search": "Name or phone",
  "attendance.visits": "visits",
  "attendance.members": "members",
  "attendance.lastVisit": "Last",
  "attendance.visitsLeft": "left",

  "storage.title": "Storage",
  "storage.search": "Product name",
  "storage.total": "Total",
  "storage.in": "In stock",
  "storage.low": "Low",
  "storage.out": "Out",
  "storage.left": "Left",
  "storage.readOnly": "This screen is read-only",

  "profile.title": "Profile",
  "profile.gym": "Gym",
  "profile.branch": "Branch",
  "profile.role": "Role",
  "profile.phone": "Phone",
  "profile.language": "Language",
  "profile.signOut": "Sign out",
  "profile.signOutConfirm": "Sign out of this account?",
  "profile.version": "Version",

  "role.owner": "Owner",
  "role.admin": "Admin",
  "role.manager": "Manager",
  "role.trainer": "Trainer",
  "role.receptionist": "Receptionist",

  "common.empty": "Nothing to show",
  "common.error": "Something went wrong",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.of": "of",
  "common.more": "more",
  "common.currency": "UZS",
  "common.loading": "Loading",
};

const DICTIONARY: Record<Locale, Messages> = { en: EN, ru: RU, uz: UZ };

export const messagesFor = (locale: Locale): Messages => DICTIONARY[locale];

export const isLocale = (value: string | undefined): value is Locale =>
  LOCALES.some((entry) => entry.code === value);

/**
 * The phone's own language, when it is one of the three.
 *
 * Read off the native settings rather than `Intl` — Hermes' locale support is
 * uneven across platforms, and `NativeModules` is what Expo's own localization
 * package reads underneath. Anything unrecognised falls through to Uzbek, which
 * is the language of the gyms this is built for.
 */
export const deviceLocale = (): Locale => {
  const raw =
    Platform.OS === "ios"
      ? ((NativeModules.SettingsManager?.settings?.AppleLocale as
          | string
          | undefined) ??
        (NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] as
          | string
          | undefined))
      : (NativeModules.I18nManager?.localeIdentifier as string | undefined);

  const code = raw?.slice(0, 2).toLowerCase();

  return isLocale(code) ? code : DEFAULT_LOCALE;
};
