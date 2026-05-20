const chat =
  document.getElementById("chat");

const input =
  document.getElementById("input");

const sendBtn =
  document.getElementById("sendBtn");

const characterSelect =
  document.getElementById("characterSelect");

const characterImg =
  document.getElementById("characterImg");

const bg =
  document.getElementById("bg");

let history = [];

let isSending = false;

/* キャラ */

function applyCharacter(){

  const char =
    characterSelect.value;

  if(char === "normal"){

    characterImg.classList.remove("show");

    setTimeout(()=>{

      characterImg.style.display =
        "none";

    },300);

    bg.style.backgroundImage =
      "";

    return;
  }

  characterImg.style.display =
    "block";

  characterImg.src =
    `${char}.png`;

  bg.style.backgroundImage =
    `url('${char}.jpg')`;

  requestAnimationFrame(()=>{

    characterImg.classList.add(
      "show"
    );
  });
}

characterSelect.addEventListener(
  "change",
  ()=>{

    history = [];

    chat.innerHTML = "";

    applyCharacter();

    addSystemMessage(
      "キャラクターを変更しました。"
    );
  }
);

applyCharacter();

/* スクロール */

function scrollBottom(){

  requestAnimationFrame(()=>{

    chat.scrollTop =
      chat.scrollHeight;
  });
}

/* メッセージ */

function addMessage(text,type){

  const row =
    document.createElement("div");

  row.className =
    `message-row ${type}`;

  const div =
    document.createElement("div");

  div.className =
    `message ${type}`;

  div.textContent = text;

  row.appendChild(div);

  chat.appendChild(row);

  scrollBottom();

  return row;
}

/* system */

function addSystemMessage(text){

  const row =
    document.createElement("div");

  row.className =
    "message-row";

  const div =
    document.createElement("div");

  div.className =
    "message ai";

  div.style.opacity = ".7";

  div.textContent = text;

  row.appendChild(div);

  chat.appendChild(row);

  scrollBottom();
}

/* loading */

function createLoading(){

  const row =
    document.createElement("div");

  row.className =
    "message-row";

  const div =
    document.createElement("div");

  div.className =
    "message ai";

  div.innerHTML = `
    <div class="typing">
      <div class="dot"></div>
      <div class="dot"></div>
      <div class="dot"></div>
    </div>
  `;

  row.appendChild(div);

  chat.appendChild(row);

  scrollBottom();

  return row;
}

/* textarea auto resize */

input.addEventListener(
  "input",
  ()=>{

    input.style.height =
      "auto";

    input.style.height =
      Math.min(
        input.scrollHeight,
        140
      ) + "px";
  }
);

/* send */

async function send(){

  if(isSending){
    return;
  }

  const text =
    input.value.trim();

  if(!text){
    return;
  }

  isSending = true;

  sendBtn.disabled = true;

  addMessage(text,"user");

  input.value = "";

  input.style.height = "58px";

  history.push({

    role:"user",

    content:text
  });

  /* 軽量化 */

  history =
    history.slice(-12);

  const loading =
    createLoading();

  try{

    const response =
      await fetch(
        "/api/deepseek",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body:JSON.stringify({

            history,

            character:
              characterSelect.value
          })
        }
      );

    const data =
      await response.json();

    loading.remove();

    if(!response.ok){

      addMessage(
        "エラー: " +
        (data.error || "unknown"),
        "ai"
      );

      return;
    }

    addMessage(
      data.reply,
      "ai"
    );

    history.push({

      role:"assistant",

      content:data.reply
    });

  }catch(err){

    console.error(err);

    loading.remove();

    addMessage(
      "通信エラーが発生しました。",
      "ai"
    );

  }finally{

    isSending = false;

    sendBtn.disabled = false;
  }
}

/* enter */

input.addEventListener(
  "keydown",
  e=>{

    if(
      e.key === "Enter" &&
      !e.shiftKey &&
      !e.isComposing
    ){

      e.preventDefault();

      send();
    }
  }
);

sendBtn.onclick = send;
