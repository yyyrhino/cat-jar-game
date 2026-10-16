import { createGameScene } from './scene.js?v=0.5.0';
import { MAX_AFFECTION } from './gameplay.js?v=0.5.0';

const stage = document.querySelector('#game-stage');
const resetButton = document.querySelector('.reset');
const loading = document.querySelector('.loading');
const announcer = document.querySelector('#announcer');
const affectionTrack = document.querySelector('.affection-track');
const affectionFill = document.querySelector('.affection-fill');
const affectionGroup = document.querySelector('.affection');
const penaltyFeedback = document.querySelector('.affection-feedback');
const gameShell = document.querySelector('.game');
const hint = document.querySelector('#interaction-hint');
const defaultHint = '左键摸摸 · 按住右键接下落的猫 · 再次右键放回';
let game;
let announcementTimer;
let feedbackTimer;

function clearFeedback() {
  clearTimeout(feedbackTimer);
  penaltyFeedback.hidden = true;
  penaltyFeedback.textContent = '';
  affectionGroup.classList.remove('is-hit');
}

function clearAnnouncement() {
  clearTimeout(announcementTimer);
  announcer.textContent = '';
}

function announce(message) {
  clearAnnouncement();
  announcer.textContent = message;
  announcementTimer = setTimeout(() => { announcer.textContent = ''; }, 1800);
}

function showAirborneHit(event) {
  clearFeedback();
  const amount = Math.min(30, Math.max(0, Number(event.amount) || 0));
  const readableAmount = Number(amount.toFixed(1)).toString();
  penaltyFeedback.textContent = amount > 0 ? `−${readableAmount}` : '拍到小猫了';
  penaltyFeedback.hidden = false;
  affectionGroup.classList.add('is-hit');
  announce(amount > 0
    ? `拍到空中的小猫了，眼睛变成叉叉，好感减少 ${readableAmount} 点。`
    : '拍到空中的小猫了，请用右键翻掌接住下落的小猫。');
  feedbackTimer = setTimeout(clearFeedback, 1400);
}
function showOutcome(event) {
  clearFeedback();
  const amount = Number(Math.max(0, event.amount).toFixed(1));
  const caught = event.type === 'catch-release';
  penaltyFeedback.textContent = caught ? `${event.timely ? '及时接住 ' : '稳稳接住 '}+${amount}`
    : amount ? `没接住 −${amount}` : '没接住';
  penaltyFeedback.hidden = false;
  announce(caught ? `已放回罐子，好感增加 ${amount} 点。` : `没接住小猫，好感减少 ${amount} 点。`);
  feedbackTimer = setTimeout(clearFeedback, 1800);
  hint.textContent = defaultHint;
}

function updateAffection(value) {
  const affection = Math.min(MAX_AFFECTION, Math.max(0, Number(value) || 0));
  const readableValue = Number(affection.toFixed(1)).toString();
  affectionFill.style.width = `${affection / MAX_AFFECTION * 100}%`;
  affectionTrack.setAttribute('aria-valuenow', readableValue);
  affectionTrack.setAttribute('aria-valuetext', `${readableValue} / ${MAX_AFFECTION}`);
}

try {
  game = await createGameScene(stage, {
    onReady() { loading.hidden = true; resetButton.disabled = false; },
    onAffection: updateAffection,
    onInteract(event) {
      if (event.type === 'airborne-hit') showAirborneHit(event);
      if (event.type === 'missed-catch' || event.type === 'catch-release') showOutcome(event);
      if (event.type === 'cat-caught') {
        clearFeedback();
        hint.textContent = `${event.timely ? '及时接住！' : '接住啦！'}松开后再次右键放回 · +${event.reward}`;
        announce(hint.textContent);
      }
      if (event.type === 'cat-placing') hint.textContent = '轻轻放回罐子…';
      if (event.type === 'finale-start') {
        clearFeedback();
        gameShell.classList.add('is-ending');
        announce('好感满了！小猫飞出罐子，眼睛亮起。');
      }
      if (event.type === 'round-ready') {
        clearFeedback();
        clearAnnouncement();
        gameShell.classList.remove('is-ending');
        hint.textContent = defaultHint;
      }
      if (event.type === 'error') {
        clearFeedback();
        clearAnnouncement();
        loading.textContent = '画面暂时中断，点击重置重新见到小猫。';
        loading.hidden = false;
      }
    },
  });
  // A read-only hook lets geometry and reset behavior be verified without game UI.
  stage.inspectFit = () => game.inspectFit();
  stage.inspectGame = () => game.inspectGame();
} catch (error) {
  clearFeedback();
  clearAnnouncement();
  console.error('Unable to load the cat scene:', error);
  stage.dataset.error = 'scene-load-failed';
  loading.textContent = '小猫没能加载，点击重置再试一次。';
  resetButton.disabled = false;
}

resetButton.addEventListener('click', () => {
  clearFeedback();
  clearAnnouncement();
  if (!game || stage.dataset.error) { window.location.reload(); return; }
  game.reset();
  announce('已重置');
});

window.addEventListener('pagehide', () => { clearFeedback(); clearAnnouncement(); game?.dispose(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
