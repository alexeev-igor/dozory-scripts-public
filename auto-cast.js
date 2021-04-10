// ==UserScript==
// @name        auto-cast
// @namespace   dozory
// @version     1
// @grant       none
// @include     http://game.dozory.ru/cgi-bin/main.cgi*
// @run-at      document-end
// ==/UserScript==

window.setAutoCast = function() {

    var templates = [
        {
            title: 'Сбор энки',
            actions: ['Реморализация', 'Обратить к свету', 'Сбор энергии']
        },
        {
            title: 'Обкаст',
            actions: ['Пыль иллюзий', 'сесть на Ведьмачью метлу', 'Пополнить энергию']
        }
    ];

    function addOptions(){
        var select = window.parent.action.document.querySelector('#auto-cast-select');
        templates.map(item => item.title).forEach((title, index) => {
            option = document.createElement('option');
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

    function injectTemplates(){
        if (window.parent.action.document.querySelector('#auto-cast-select')){
            return;
        }
        var div = window.parent.action.document.querySelector('#select');
        div.innerHTML += htmlTemplate;
        addOptions();
    }
    
    window.onAutoCastChanged = function(index){
        if (index < 0){
            return;
        }

        templates[index].actions.forEach(actionTitle => {
            var filter = a => a[0].toLowerCase().trim().includes(actionTitle.toLowerCase().trim());

            var presets = acts_br.filter(filter);
            if (presets.length > 0){
                var cast = presets[0];
                parent.acts_sel.push(['0', 'mg', window.parent.action.__lact, '', cast[3]])
            };

            presets = acts_mg.filter(filter);
            if (presets.length > 0){
                var cast = presets[0];
                parent.acts_sel.push(['3', 'mg', window.parent.action.person.person_id, '', cast[3]])
            }

            presets = acts_ar.filter(filter);
            if (presets.length > 0){
                var cast = presets[0];
                parent.acts_sel.push(['1', 'ar', window.parent.action.person.person_id, '', cast[3]])
            }

            presets = acts_am.filter(filter);
            if (presets.length > 0){
                var cast = presets[0];
                parent.acts_sel.push(['0', 'am', window.parent.action.person.person_id, '', cast[3]])
            }
        });

        window.parent.action.sendActions(0);
    }

    injectTemplates();
};

window.setAutoCast();
