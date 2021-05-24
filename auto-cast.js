// ==UserScript==
// @name        auto-cast
// @namespace   dozory
// @version     2.0
// @grant       none
// @include     http://game.dozory.ru/cgi-bin/main.cgi*
// @include     http://game.dozory.ru/ajax.html*
// @run-at      document-end
// ==/UserScript==

var templates = [{
  title: 'Сбор энки',
  actions: ['Реморализация', 'Обратить к свету', 'Сбор энергии']
},
{
  title: 'Обкаст',
  actions: ['Пыль иллюзий', 'сесть на Ведьмачью метлу']
}
];

var isAjax = window.location.href.includes("http://game.dozory.ru/ajax.html");

function addOptions() {
  var select = isAjax ? window.document.querySelector('#auto-cast-select') : window.parent.action.document.querySelector('#auto-cast-select');
  templates.map(item => item.title).forEach((title, index) => {
    let option = document.createElement('option');
    option.value = index;
    option.text = title;
    select.add(option);
  });
}


var htmlTemplate =
  `<table cellspacing="0" cellpadding="0" id="actionTbl" style="font-weight: bold; font-size: 8pt; width: 442px;">
<tbody>
    <tr id="autocast">
        <td height="21px" width="115px"></td>
        <td width="220px">
        <select id="auto-cast-select" style="width:100%;"
                onchange="window.onAutoCastChanged(this.options[this.selectedIndex].value)">
            <option value="-1" disabled selected>Выберите шаблон автокаста
            </option>
        </select></td>
        <td width="75px" align="center"></td>
        <td width="25px" align="center"></td>
    </tr>
</tbody>
</table>`;

window.getCastTarget = function(castType){
  let isLocationcast = castType === 128;

  if (isAjax){
    return isLocationcast ? window.__lact : window.__act;
  }else{
    return isLocationcast ? window.parent.action.__lact : window.parent.action.person.person_id;
  }
}

window.pushCastParams = function(castPresets){
  if (castPresets.length > 0) {
    let cast = castPresets[0];
    parent.acts_sel.push(['', '', getCastTarget(cast[7]), '', cast[3]])
  };
}

window.onAutoCastChanged = function (index) {
  if (index < 0) {
    return;
  }

  templates[index].actions.forEach(actionTitle => {
    var filter = a => a[0].toLowerCase().trim().includes(actionTitle.toLowerCase().trim());

    pushCastParams(acts_br.filter(filter));
    pushCastParams(acts_mg.filter(filter));
    pushCastParams(acts_ar.filter(filter));
    pushCastParams(acts_am.filter(filter));
  });

  if (isAjax) {
    Actions.apply();
  } else {
    window.parent.action.sendActions(0);
  }
}

window.setAutoCast = function () {
  if (window.parent.frameset_type != 'peace' && !isAjax) {
    return;
  }

  function injectTemplates() {
    if (isAjax || window.parent.action.document.querySelector('#auto-cast-select')) {
      return;
    }
    var div = window.parent.action.document.querySelector('#select');
    if (div){
      div.innerHTML += htmlTemplate;
      addOptions();
    }
    
  }


  injectTemplates();
};

function ajaxLoadingDom() {
  const config = {
    childList: true,
    subtree: true
  };

  const callback = function (list, observer) {
    for (let mutation of list) {
      if (mutation.addedNodes.length > 0) {
        for (let node of mutation.addedNodes) {
          if (node.childNodes == null || node.childNodes.length === 0)
            continue;

          let divSelect = window.document.querySelector('#select');
          if (divSelect && !window.document.querySelector('#auto-cast-select')) {
            divSelect.innerHTML += htmlTemplate;
            addOptions();
          }
        }
      }
    }
  };

  const observer = new MutationObserver(callback);

  observer.observe(document.body, config);
}

if (isAjax) {
  ajaxLoadingDom();
} else {
  window.setAutoCast();
}