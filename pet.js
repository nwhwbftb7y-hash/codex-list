(function () {
  const AFFECTION_KEY = "today-highland-cow-v1";
  const POSITION_KEY = "today-highland-cow-position-v1";
  const replies = [
    "哞～再摸一下！", "刘海有没有乱呀？", "今天也要慢慢来。",
    "哞哞喜欢你！", "给你一点牛气！", "摸到最蓬松的地方啦～",
  ];

  function readNumber(key) {
    try { return Math.max(0, Number(localStorage.getItem(key)) || 0); }
    catch { return 0; }
  }

  function readPosition() {
    try { return JSON.parse(localStorage.getItem(POSITION_KEY)) || null; }
    catch { return null; }
  }

  let affection = readNumber(AFFECTION_KEY);
  const pet = document.createElement("aside");
  pet.className = "desk-pet";
  pet.setAttribute("aria-label", "可拖动的苏格兰高地牛桌宠");
  pet.innerHTML = `
    <div class="cow-speech" role="status" aria-live="polite">摸摸我，也可以拖着我走～</div>
    <button class="highland-cow" type="button" aria-label="摸摸或拖动小高地牛">
      <img class="cow-image" src="assets/highland-cow.png" alt="毛茸茸、圆嘟嘟的苏格兰高地牛" draggable="false" />
      <span class="cow-shadow"></span>
    </button>
    <div class="cow-affection">亲密度 <b>${affection}</b></div>`;
  document.body.append(pet);

  const cow = pet.querySelector(".highland-cow");
  const speech = pet.querySelector(".cow-speech");
  const score = pet.querySelector(".cow-affection b");
  let speechTimer;
  let drag = null;
  let suppressClick = false;

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function placePet(left, top) {
    const width = pet.offsetWidth || 190;
    const height = pet.offsetHeight || 190;
    pet.style.left = `${clamp(left, 0, window.innerWidth - width)}px`;
    pet.style.top = `${clamp(top, 0, window.innerHeight - height)}px`;
    pet.style.right = "auto";
    pet.style.bottom = "auto";
  }

  const saved = readPosition();
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    requestAnimationFrame(() => placePet(saved.x * window.innerWidth, saved.y * window.innerHeight));
  }

  function savePosition() {
    const rect = pet.getBoundingClientRect();
    const value = { x: rect.left / window.innerWidth, y: rect.top / window.innerHeight };
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(value)); } catch { /* private mode */ }
  }

  function makeHeart() {
    const heart = document.createElement("span");
    heart.className = "cow-heart";
    heart.textContent = affection % 5 === 0 ? "✨" : "♥";
    heart.style.setProperty("--heart-x", `${Math.round(Math.random() * 36 - 18)}px`);
    pet.append(heart);
    heart.addEventListener("animationend", () => heart.remove(), { once: true });
  }

  function petCow() {
    if (suppressClick) return;
    affection += 1;
    try { localStorage.setItem(AFFECTION_KEY, String(affection)); } catch { /* private mode */ }
    score.textContent = affection;
    speech.textContent = replies[(affection - 1) % replies.length];
    speech.classList.add("show");
    cow.classList.remove("is-petted");
    void cow.offsetWidth;
    cow.classList.add("is-petted");
    makeHeart();
    clearTimeout(speechTimer);
    speechTimer = setTimeout(() => speech.classList.remove("show"), 2600);
  }

  cow.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = pet.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    cow.setPointerCapture?.(event.pointerId);
    cow.classList.add("is-dragging");
  });

  cow.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 5) drag.moved = true;
    if (drag.moved) {
      event.preventDefault();
      placePet(drag.left + dx, drag.top + dy);
    }
  });

  function finishDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    cow.releasePointerCapture?.(event.pointerId);
    cow.classList.remove("is-dragging");
    if (drag.moved) {
      suppressClick = true;
      savePosition();
      setTimeout(() => { suppressClick = false; }, 0);
    }
    drag = null;
  }

  cow.addEventListener("pointerup", finishDrag);
  cow.addEventListener("pointercancel", finishDrag);
  cow.addEventListener("click", petCow);
  cow.addEventListener("animationend", (event) => {
    if (event.animationName === "cow-bounce") cow.classList.remove("is-petted");
  });
  window.addEventListener("resize", () => {
    const rect = pet.getBoundingClientRect();
    placePet(rect.left, rect.top);
    savePosition();
  });
})();
