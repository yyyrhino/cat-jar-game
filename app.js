import { createGameScene } from './scene.js';

const stage = document.querySelector('#game-stage');
const resetButton = document.querySelector('.reset');
const loading = document.querySelector('.loading');
const announcer = document.querySelector('#announcer');
const affectionTrack = document.querySelector('.affection-track');
const affectionFill = document.querySelector('.affection-fill');
let game;
let announcementTimer;

function announce(message) {
  clearTimeout(announcementTimer);
  announcer.textContent = message;
  announcementTimer = setTimeout(() => { announcer.textContent = ''; }, 1800);
}

function updateAffection(value) {
  const affection = Math.min(100, Math.max(0, Number(value) || 0));
  const readableValue = Number(affection.toFixed(1)).toString();
  affectionFill.style.width = `${affection}%`;
  affectionTrack.setAttribute('aria-valuenow', readableValue);
  affectionTrack.setAttribute('aria-valuetext', `${readableValue} / 100`);
}

try {
  game = await createGameScene(stage, {
    onReady() { loading.hidden = true; resetButton.disabled = false; },
    onAffection: updateAffection,
    onInteract(event) {
      if (event.type === 'error') {
        loading.textContent = '画面暂时中断，点击重置重新见到小猫。';
        loading.hidden = false;
      }
    },
  });
  // A read-only hook lets geometry and reset behavior be verified without game UI.
  stage.inspectFit = () => game.inspectFit();
  stage.inspectGame = () => game.inspectGame();
} catch (error) {
  console.error('Unable to load the cat scene:', error);
  stage.dataset.error = 'scene-load-failed';
  loading.textContent = '小猫没能加载，点击重置再试一次。';
  resetButton.disabled = false;
}

resetButton.addEventListener('click', () => {
  if (!game || stage.dataset.error) { window.location.reload(); return; }
  game.reset();
  announce('已重置');
});

window.addEventListener('pagehide', () => { clearTimeout(announcementTimer); game?.dispose(); });
window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
