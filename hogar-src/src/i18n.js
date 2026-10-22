// Textos del Hogar en español, inglés y ruso.
const T = {
  es: {
    title: 'Nuestro hogar', tagline: 'Un lugar para estar juntos aunque estén lejos.',
    create: 'Crear un hogar nuevo', join: 'Entrar con un código', codePh: 'Código, por ejemplo LUNA-4821-SOL',
    enter: 'Entrar', yourName: 'Tu nombre', look: 'Cómo te ves', woman: 'Mujer', man: 'Hombre',
    skin: 'Piel', light: 'Clara', dark: 'Oscura', hair: 'Pelo', shirt: 'Remera', pants: 'Pantalón',
    codeIs: 'Código del hogar', share: 'Compartilo sólo con tu pareja. Quien tenga el código puede entrar.',
    copy: 'Copiar', copied: 'Copiado', fromAccount: 'Hogar de tu cuenta DuoLector',
    day: 'Día', night: 'Noche', say: 'Escribí algo…', send: 'Enviar', sit: 'Sentarse', stand: 'Pararse',
    wave: 'Saludar', dance: 'Bailar', alone: 'Estás en el hogar. Esperando a tu pareja…', together: 'están juntos',
    joined: 'entró al hogar', left: 'salió del hogar', full: 'Este hogar ya tiene dos personas.',
    photo: 'Foto del marco', putPhoto: 'Elegir foto', removePhoto: 'Quitar', close: 'Cerrar',
    photoNote: 'La foto queda sólo en sus dos dispositivos.', offline: 'Sin conexión: tu pareja no te ve ahora.',
    robotHi: '¡Hola!', robotName: 'Lumi', help: 'Tocá el piso para caminar · tocá el sillón para sentarte · tocá un marco para poner una foto',
    badPhoto: 'No se pudo abrir esa foto. Probá con otra.', leave: 'Salir', loading: 'Preparando el hogar…', badCode: 'Ese código no parece válido.',
  },
  en: {
    title: 'Our home', tagline: 'A place to be together, even from far away.',
    create: 'Create a new home', join: 'Join with a code', codePh: 'Code, e.g. LUNA-4821-SOL',
    enter: 'Enter', yourName: 'Your name', look: 'How you look', woman: 'Woman', man: 'Man',
    skin: 'Skin', light: 'Light', dark: 'Dark', hair: 'Hair', shirt: 'Shirt', pants: 'Pants',
    codeIs: 'Home code', share: 'Share it only with your partner. Anyone with the code can come in.',
    copy: 'Copy', copied: 'Copied', fromAccount: 'Your DuoLector account home',
    day: 'Day', night: 'Night', say: 'Say something…', send: 'Send', sit: 'Sit', stand: 'Stand up',
    wave: 'Wave', dance: 'Dance', alone: "You're home. Waiting for your partner…", together: 'are together',
    joined: 'came home', left: 'left', full: 'This home already has two people.',
    photo: 'Frame photo', putPhoto: 'Choose photo', removePhoto: 'Remove', close: 'Close',
    photoNote: 'The photo stays only on your two devices.', offline: "Offline: your partner can't see you right now.",
    robotHi: 'Hi!', robotName: 'Lumi', help: 'Tap the floor to walk · tap the sofa to sit · tap a frame to add a photo',
    badPhoto: "Couldn't open that photo. Try another one.", leave: 'Leave', loading: 'Getting the home ready…', badCode: "That code doesn't look right.",
  },
  ru: {
    title: 'Наш дом', tagline: 'Место, где можно быть вместе, даже на расстоянии.',
    create: 'Создать новый дом', join: 'Войти по коду', codePh: 'Код, например LUNA-4821-SOL',
    enter: 'Войти', yourName: 'Твоё имя', look: 'Как ты выглядишь', woman: 'Женщина', man: 'Мужчина',
    skin: 'Кожа', light: 'Светлая', dark: 'Тёмная', hair: 'Волосы', shirt: 'Футболка', pants: 'Брюки',
    codeIs: 'Код дома', share: 'Делись им только с партнёром. Любой с кодом может войти.',
    copy: 'Копировать', copied: 'Скопировано', fromAccount: 'Дом твоего аккаунта DuoLector',
    day: 'День', night: 'Ночь', say: 'Напиши что-нибудь…', send: 'Отправить', sit: 'Сесть', stand: 'Встать',
    wave: 'Помахать', dance: 'Танцевать', alone: 'Ты дома. Ждём партнёра…', together: 'вместе',
    joined: 'пришёл(а) домой', left: 'ушёл(а)', full: 'В этом доме уже два человека.',
    photo: 'Фото в рамке', putPhoto: 'Выбрать фото', removePhoto: 'Убрать', close: 'Закрыть',
    photoNote: 'Фото хранится только на ваших двух устройствах.', offline: 'Нет связи: партнёр тебя сейчас не видит.',
    robotHi: 'Привет!', robotName: 'Луми', help: 'Нажми на пол, чтобы идти · на диван, чтобы сесть · на рамку, чтобы добавить фото',
    badPhoto: 'Не удалось открыть это фото. Попробуй другое.', leave: 'Выйти', loading: 'Готовим дом…', badCode: 'Код выглядит неверно.',
  },
};
function pickLang() {
  try { const s = localStorage.getItem('duolector.hogar.lang'); if (s && T[s]) return s; } catch {}
  const p = new URLSearchParams(location.hash.slice(1)).get('l');
  if (p && T[p]) return p;
  for (const l of navigator.languages || [navigator.language || 'es']) {
    const k = String(l).slice(0, 2).toLowerCase(); if (T[k]) return k;
  }
  return 'es';
}
export let lang = pickLang();
export function setLang(l) { if (T[l]) { lang = l; try { localStorage.setItem('duolector.hogar.lang', l); } catch {} } }
export const t = (k) => (T[lang] && T[lang][k]) || T.es[k] || k;
