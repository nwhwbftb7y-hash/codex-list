const form = document.querySelector("#checkin-form");
const nameInput = document.querySelector("#name");
const noteInput = document.querySelector("#note");
const message = document.querySelector("#form-message");
const list = document.querySelector("#checkin-list");
const emptyState = document.querySelector("#empty-state");
const count = document.querySelector("#checkin-count");
const template = document.querySelector("#checkin-template");
const refreshButton = document.querySelector("#refresh-button");

document.querySelector("#today").textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "long", day: "numeric", weekday: "long",
}).format(new Date());

function formatTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(value));
}

function renderCheckins(checkins) {
  list.replaceChildren();
  count.textContent = checkins.length;
  emptyState.hidden = checkins.length !== 0;

  for (const checkin of checkins) {
    const fragment = template.content.cloneNode(true);
    const article = fragment.querySelector(".checkin-card");
    const avatar = fragment.querySelector(".avatar");
    const heading = fragment.querySelector("h3");
    const time = fragment.querySelector("time");

    avatar.textContent = checkin.name.slice(0, 1).toUpperCase();
    heading.textContent = checkin.name;
    fragment.querySelector(".checkin-content > p").textContent = checkin.note;
    time.dateTime = checkin.createdAt;
    time.textContent = formatTime(checkin.createdAt);
    article.style.setProperty("--delay", `${Math.min(list.children.length * 45, 270)}ms`);
    list.append(fragment);
  }
  list.setAttribute("aria-busy", "false");
}

async function loadCheckins({ quiet = false } = {}) {
  try {
    const response = await fetch("/api/checkins", { cache: "no-store" });
    if (!response.ok) throw new Error("读取失败");
    const payload = await response.json();
    renderCheckins(payload.checkins);
  } catch {
    if (!quiet) {
      message.textContent = "暂时无法读取打卡记录，请稍后再试。";
      message.dataset.type = "error";
    }
    list.setAttribute("aria-busy", "false");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = form.querySelector("button[type='submit']");
  const name = nameInput.value.trim();
  const note = noteInput.value.trim() || "已练不欠";
  if (!name) return nameInput.focus();

  submitButton.disabled = true;
  message.textContent = "正在留下今天的记录…";
  message.dataset.type = "";

  try {
    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, note }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "打卡失败");
    renderCheckins(payload.checkins);
    nameInput.value = "";
    noteInput.value = "已练不欠";
    message.textContent = "打卡成功。今天这笔，算数。";
    message.dataset.type = "success";
    nameInput.focus();
  } catch (error) {
    message.textContent = error.message || "打卡失败，请稍后再试。";
    message.dataset.type = "error";
  } finally {
    submitButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => loadCheckins());
loadCheckins();
setInterval(() => loadCheckins({ quiet: true }), 15000);
