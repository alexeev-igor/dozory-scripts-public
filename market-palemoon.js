// ==UserScript==
// @name        market-palemoon
// @namespace   dozory
// @include     http://game.dozory.ru/ajax.html*
// @version     1.10
// @grant       none
// @run-at      document-start
// ==/UserScript==

(function () {
    String.Buffer = function Buffer(str) {
        var i = 0,
            b = [str || ''];

        function _s(sp) {
            return b.join(sp || '');
        };

        function _a() {
            for (var k = 0, f = arguments.length; k < f; k++) b[++i] = arguments[k];
            return this;
        };

        this.append = this.a = _a;
        this.valueOf = this.toString = this.s = _s;
    };

    window.sm_createWindow = function () {
        var jq = window.jQuery;

        jq('head').append(
            '<style type="text/css">\n\
            #vSM { width:700px; display:block; position:absolute;top:40px;left:10px;z-index:20; }\
            #add_inv_win { z-index: 100; }' +

            // фильтр

            'span.nvSMc { padding: 0 1ex 0 0; font-weight: bold; color: black; cursor: pointer;} span.nvSMc.active { color:darkred;}' +

            // прочее

            '#SM_walk     { padding: 1ex 0;}\
            .tSMrow abbr { border: none;  }' +

            // стилизация списка

            'table#tSM TD { text-align:right; cursor:arrow;}' +
            (
                'table#tSM TD {line-height:1.68em;padding-right:4pt;border-bottom-color:transparent;border-right-color:#BFBAB0;}' +
                'table#tSM TR:nth-child(even) {background:#D5D5D5;}'

            ) +

            '#vSM .bottom {cursor: pointer;}' +
            '\n</style>\n'
        );

        jq('body').append(
            '\
                <div id="vSM">\
                <table style="margin: 0pt; width: 100%;" class="inner_window gray_scheme">\
                <tr class="caption"><td>\
                <table><tr>\
                <td class="popup_title">&nbsp;ОБЗОР ПАЛАТОК</td>\
                <td style="width: 10px;" onclick="window.jQuery(\'#vSM\').hide();"><img class="popup_close_" style="cursor: pointer;" valign="middle" src="http://st.dozory.ru/img/windows/popup_close_icon.gif"/></td>\
                </tr></table></td></tr>\
                <tr class="content">\
                <td class="popup_content" style="padding: 5px 8px 0 8px;">' +

            // фильтр

            '<div id="nvSM" style="height: 20px;"></div>' +

            // зона вывода

            '\
                <div class="scrolling" style="height: 260px;" id="dtSM"></div>\
                </td></tr>' +

            // зона кнопок

            '\
                <tr><td>\
                \
                <table style="margin: 0px; padding: 5px 8px 0 8px;" width=100%><tr>\
                <td width=100%>&nbsp;</td>\
                <td onclick="">\
                \
                <table onclick="window.sm_review();" cellspacing="0" cellpadding="0" style="cursor: pointer; border: none" align="center" class="button">\
                <tr height="30">\
                    <td style="border: none" width="12"><img src="http://st.dozory.ru/img/buttons/blue_left.png"  class="iePNG"></td>\
                    <td style="background: url(\'http://st.dozory.ru/img/buttons/blue.png\') top left repeat-x; white-space: nowrap; vertical-align: middle; color: white; text-align: center; border: none" class="iePNG">Осмотреть палатки</td>\
                    <td style="border: none" width="16"><img src="http://st.dozory.ru/img/buttons/blue_right.png" class="iePNG"></td>\
                </tr>\
                </table>\
                \
                </td>\
                </tr></table>\
                </td></tr>\
                \
                <tr class="bottom"><td/></tr></table>\
                </div>'
        );

        var hdtSM = jq('#dtSM');
        var vsm = jq('#vSM');
        var bottom = jq('.bottom:last', vsm);
        var drag = false;

        bottom.mousedown(
            function (e) {
                drag = true;
                var dy = e.pageY - hdtSM.height();
                jq(document).mousemove( // при перемещении мыши
                    function (a) {
                        hdtSM.css({
                            height: Math.max(200, a.pageY - dy) + 'px'
                        }); // расширяем блок
                        a.target.ownerDocument.defaultView.getSelection().removeAllRanges(); // снимаем выделение текста
                        return false;
                    });
                vsm.fadeTo(400, 0.86);
            });
        jq(document).mouseup(function () { // когда мышь отпущена
            jq(document).unbind('mousemove'); // убираем событие при перемещении мыши
            if (drag) {
                vsm.fadeTo(400, 1.0);
            }
            drag = false;
        });

        window.sm_window = vsm;

        window.sm_review = function () {
            window.isSearching = true;

            var tz = jq.ajax({
                url: "/cgi-bin/window.cgi?wblocks_params=street_market_body%3Droom%253Dbuy_room&blocks=street_market_body&blocks=chat&cwindow=street_market",
                async: false
            }).responseText;

            jq('#dtSM').html('<div id="SM_walk">Обходим палатки:</div>');

            // выдираем палатки из ответа сервера в массив

            var rex_booths = /booth_id="(\d+)"\s?name="(.*?)"/ig;
            var booths = [];
            while (m = rex_booths.exec(tz)) booths.push({
                id: m[1],
                name: m[2]
            });

            // обходим палатки по массиву

            var items = [],
                p, t, request_count = booths.length,
                rex_items = /item (.*?)\<\/item\>/ig;

            for (var key = 0; key < booths.length; key++) {
                p = jq('<b style="color: red;">' + booths[key].name + '<br></b>').insertAfter('#SM_walk');
                jq.ajax({
                    url: '/cgi-bin/window.cgi?blocks=street_market_body&wblocks_params=street_market_body%3Dbooth_id%253D' +
                        booths[key].id +
                        '%2526room%253Dbuy_room&cwindow=street_market&dozory-ir',
                    cache: false,
                    dataType: 'text',

                    key: key,
                    p: p,
                    error: function () {
                        console.log("market-palemoon: Can't load request...")
                    },
                    success: function (data, status) {
                        while (m = rex_items.exec(data)) {
                            var itm = {};
                            itm.oid = booths[this.key].id;
                            itm.onm = booths[this.key].name;

                            itm.cnt = /cnt="(\d+)"/.exec(m[1])[1];
                            itm.prs = /price="(\d+|\d+\.\d+)"/.exec(m[1])[1];
                            itm.id = /id="(.*?)"/.exec(m[1])[1];

                            itm.icon = /icon\>(.*?)\<\/icon/.exec(m[1])[1];
                            itm.name = /[^_]name\>(.*?)\<\/name/.exec(m[1])[1];

                            itm.q = /quality_rest\>(.*?)\<\/quality_rest/.exec(m[1])[1];
                            itm.inv = /hide_pct\>(.*?)\<\/hide_pct/.exec(m[1])[1];
                            itm.dur = /crits_rest\>(.*?)\<\/crits_rest/.exec(m[1])[1];

                            if (tp = /use_rest\>(.*?)\<\/use_rest/.exec(m[1])) {
                                itm.l = tp[1];
                                itm.r = 0;
                            }

                            if (tp = /charges_rest\>(.*?)\<\/charges_rest/.exec(m[1])) {
                                itm.l = /charges_rest\>(.*?)\<\/charges_rest/.exec(m[1])[1];
                                itm.r = /loads_rest\>(.*?)\<\/loads_rest/.exec(m[1])[1];
                            }

                            if (tp = /creator\>(.*?)\<\/creator/.exec(m[1])) // параметры варки
                            {
                                itm.cf = tp[1];
                                itm.cc = /конц\..*?(\d+)/.exec(tp[1])[1];
                                itm.cv = /воспр\..*?(\d+)/.exec(tp[1])[1];
                                itm.cl = /уд\..*?(\d+)/.exec(tp[1])[1];
                                itm.ci = /инк\..*?(\d+)/.exec(tp[1])[1];
                                itm.ck = /кум\..*?(\d+)/.exec(tp[1])[1];
                                itm.cm = /мод\..*?(\d+)/.exec(tp[1])[1];
                            } else delete itm.cc;

                            items.push(itm);
                        }
                        jq(this.p).css('color', 'black');
                    },

                    complete: function () {
                        if (--request_count) return; // не все запросы отработаны

                        // сортируем список

                        items.sort(
                            function (i1, i2) {
                                var x = i1.name.replace(/(^\s+| \(.*?\)|\s+$)/g, "").toLowerCase();
                                var y = i2.name.replace(/(^\s+| \(.*?\)|\s+$)/g, "").toLowerCase();

                                if (x == y) {
                                    x = Number(i1.prs);
                                    y = Number(i2.prs);
                                }
                                return ((x < y) ? -1 : ((x > y) ? 1 : 0));
                            }
                        );

                        // формируем таблицу вывода

                        var lt = "",
                            cl = String.fromCharCode(0),

                            t = new String.Buffer(),
                            n = new String.Buffer();

                        t.a('<span id="tSM_style" style="display:none;"></span>')
                            .a('<table class="full" id="tSM"><col><col><col><col><col><col><col>');

                        for (i = 0; i < items.length; i++) {
                            // буквы навигатора
                            var c = items[i].name.charAt(0).toLowerCase();
                            if (c != cl) {
                                lt = c + lt;
                                cl = c;
                            }

                            t.a('<tr class="tSMrow" data-nv="').a(c).a('">')
                                .a('<td style="text-align:left;"><abbr title="').a(items[i].onm).a('">').a(items[i].name).a('</abbr></td>')
                                .a('<td>').a(items[i].cnt).a('</td>');

                            if (items[i].cc) {
                                t.a('<td><abbr title="конц: ')

                                    .a(items[i].cc)
                                    .a(' воспр: ').a(items[i].cv)
                                    .a(' уд: ').a(items[i].cl)
                                    .a('  инк: ').a(items[i].ci)
                                    .a(' кум: ').a(items[i].ck)
                                    .a(' мод: ').a(items[i].cm)
                                    .a('">')
                                    .a(items[i].q)
                                    .a('</abbr></td>');
                            } else
                                t.a('<td style="color: gray;">')
                                .a(items[i].q)
                                .a('</td>')

                            t.a('<td style="text-align: left;">').a((items[i].l) ? items[i].l + '+' + items[i].r : '').a('</td>');
                            t.a('<td>').a(items[i].inv).a('%</td>');
                            t.a('<td>').a(items[i].dur).a('</td>');
                            t.a('<td>').a(items[i].prs).a('</td>');
                            t.a('</tr>');
                        }
                        t.a('</table>');

                        // создаем навигатор

                        n.a('<span class="nvSMc" onclick="window.sm_filter(this);">ВСЕ</span>');
                        for (i = lt.length - 1; i >= 0; i--)
                            n.a('<span class="nvSMc" onclick="window.sm_filter(this, \'')
                            .a(lt.charAt(i))
                            .a('\');">')
                            .a(lt.charAt(i).toUpperCase())
                            .a('</span>');

                        // вывод

                        var delay = 400;

                        jq('#dtSM').fadeOut(delay,
                            function () {
                                jq('#dtSM').html(t.s(''));
                                jq('#nvSM').html(n.s(''));
                                jq("span.nvSMc.active").removeClass("active");
                                jq("span.nvSMc:first").addClass("active");
                            }
                        );
                        jq('#dtSM').fadeIn(delay,
                            function () {
                                jq('#tSM col').each(
                                    function (i, e) {
                                        var o = jq(e);
                                        if (i) o.width(o.width());
                                    } // закрепление колонок
                                );
                            }
                        );

                        window.isSearching = false;
                    }
                });
            }
        }

        window.sm_filter = function (o, l) {
            jq('span.nvSMc.active').removeClass('active');
            jq('#tSM_style').html(
                typeof (l) == 'undefined' ? '' :
                '<style type="text/css">tr.tSMrow {display:none;} tr.tSMrow[data-nv="' + l + '"] {display:table-row;}</style>'
            );
            jq(o).addClass("active");
            return false;
        }
    }
})();

(function () {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function () {
        this.addEventListener('load', function () {
            if (window.isSearching) return;

            var rt = this.responseText,
                p1 = rt.indexOf('<block name="street_market_body"');

            var loc = /window name="(.*?)"\>/.exec(this.responseText);

            if (loc != null && loc.length > 1 && loc[1] === 'street_market') {
                if (p1 < 0) return;

                if (rt.indexOf('<block name="street_market_body" room="hall">', p1) < 0)
                    window.jQuery('#vSM').hide();
                else {
                    if ('sm_window' in window)
                        window.sm_window.show();
                    else
                        window.sm_createWindow();
                }


            }
        });
        origOpen.apply(this, arguments);
    };
})();