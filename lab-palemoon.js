// ==UserScript==
// @name        lab-palemoon
// @namespace   dozory
// @include     http://game.dozory.ru/ajax.html*
// @version     1.23
// @grant       none
// @run-at      document-start
// ==/UserScript==

window.labSettings = {};

window.saveSetting = function (cname, cvalue, exdays) {
    window.labSettings[cname] = cvalue;
    window.localStorage.setItem(cname, cvalue);
}

window.getSetting = function (cname) {
    var value = window.labSettings[cname];
    if (value) {
        return value;
    }

    value = window.localStorage.getItem(cname) || '';
    window.labSettings[cname] = value;
    return value;
}

window.catchRequest = function (location, request) {
    function moveTab(){
        window.lb.ariadna.showWindow();
        if (!window.lb.ariadna.is_visited()) {
            window.lb.chk_tunnels(function (tunnels) {
                window.lb.ariadna.appendCurrentRoom(tunnels, window.lb.content);
            });
        } else {
            switch (window.lb.content) {
                case 'exit':
                    var obj = /Labyrinth\.moveTo\((\d+)/.exec(rt);
                    if (obj) window.lb.ariadna.setExit(obj[1] - 1);
                    break;
                default:
                    if (window.lb.content != 'undefined') window.lb.ariadna.setCurrentContent(window.lb.content);
            }
        }
        window.lb.ariadna.setDir(window.lb.dir);
    }

    switch (location) {
        case 'vault':
            window.jQuery('#ariadna').css('display', 'none');
            break;
        case 'labyrinth_entrance':
            window.saveSetting('map_state', '', 1);
            break;
        case 'labyrinth_tunnel':
            var rt = request.responseText;
            window.AJAX_LB_run_once();
            window.lb.ariadna.updateTime();
            window.lb.at_tunnel = window.lb.ariadna.moveToTunnel(window.lb.look_direction = /look_direction="(\d*)"/.exec(rt)[1] - 1);
            break;
        case 'labyrinth':
            var rt = request.responseText;

            window.AJAX_LB_run_once();
            window.lb.ariadna.updateTime();
            window.lb.at_tunnel = !window.lb.ariadna.moveToRoom();

            window.lb.parseResponse(rt);

            switch (window.lb.tab) {
                case 0:
                    moveTab();
                    break;
                case 1:
                default:
                    var img = window.jQuery('img[button_id]');
                    if (img.attr('button_id') === 'labyrinth_movement'){
                        moveTab();
                    }else{
                        window.lb.ariadna.hideWindow();
                    }
                    
            }
            break;
        default:
            return;
    }
}

window.addEventListener('DOMContentLoaded', function (e) {
    window.wm.saveLoaded = window.wm.loaded;
    window.wm.loaded = function (req_id, request) {
        this.saveLoaded(req_id, request);
        var location = /window name="(.*?)"\>/.exec(request.responseText);
        window.catchRequest(location[1], request);
    };
}, false);

(function () {
    String.prototype.inject = function (obj) {
        var a = arguments;
        var i = 0;

        if (typeof obj != 'object')
            return this.replace(/\%s/g, function () {
                return String(a[i++]);
            });

        if (obj instanceof Array)
            return this.replace(/\%s/g, function () {
                return obj[i++];
            });

        return this.replace(/{([^{}]*)}/g,
            function (s, b) {
                var r = obj[b];
                return typeof r === 'string' || typeof r === 'number' ? r : s;
            });
    };

    window.AJAX_LB_run_once = function () {
        if (window.getSetting('map_reset') == 'true') {
            window.saveSetting('map_state', '', 1); // удаление сохранённой карты
            window.saveSetting('map_reset', 'false', 1);
        }

        window.lb = window.lb || {
            chk_tunnels: function (callback) {
                if (this.tab != 0) return;

                var roads = [],
                    request_count = 8;
                for (var i = 0; i < 8; i++) // 8 асинхронных запросов на вращение вправо со снятием данных
                    window.jQuery.ajax({
                        url: "http://game.dozory.ru/cgi-bin/labyrinth.cgi?blocks=labyrinth_movement&rm=change-look-direction&move-to=right&wblocks_params=&cwindow=labyrinth&dozory-ir-" + i,
                        cache: false,
                        dataType: 'text',
                        error: function (XMLHttpRequest, textStatus, errorThrown) {
                            alert('Ошибка поиска туннелей. Нажмите F5. Если не помогает, закройте и откройте окно игры.');
                            console.log("ajax_lb: Can't load tunnel... " + textStatus);
                        },
                        success: function (data, status) {
                            roads[Number(/road\>(.*?)\<\/road/.exec(data)[1])] = 1; // достаточно первой попавшейся дороги
                            if (!--request_count) // все запросы отработаны
                                callback(roads.slice(1));
                        },
                        complete: function () {}
                    });
            },
            parseResponse: function (rt) {
                var b = rt.split('block name="'),
                    i, obj;
                for (i = b.length - 1; i > 0; i--) {
                    switch (b[i].substr(0, b[i].indexOf('"'))) {
                        case 'labyrinth_background':
                            break;
                        case 'actions':
                            this.tab = 1;
                            break;
                        case 'labyrinth_movement':
                            this.tab = 0;
                            if (obj = /look-direction="(\d*)"/.exec(b[i])) {
                                this.dir = obj[1] - 1;
                            }
                            if (obj = /fountain type="(\d*)"/.exec(b[i])) {
                                this.content = this.ariadna.sources[obj[1] - 1] + ':' + /cnt_drinks="(\d*)"/.exec(b[i])[1];
                                break;
                            }
                            if (obj = /labyrinth bots="(.*?)"/.exec(b[i])) {
                                if (obj[1] != '') {
                                    this.content = 'b:' + obj[1];
                                    break;
                                }
                            }
                            if (b[i].indexOf('<has_items>1') >= 0) {
                                this.content = 'loot';
                                const roomId = this.ariadna.state.in_room.i;
                                const ind = this.ariadna.state.bots_met_indexes.indexOf(roomId); 
                                if (ind > -1){
                                    this.ariadna.state.bots_killed++;
                                    this.ariadna.state.bots_met_indexes.splice(ind, 1);
                                    this.ariadna.svg.header.bots.textContent = this.ariadna.state.bots_killed + ' / 19';
                                    this.ariadna.saveContent();
                                }
                                break;
                            }
                            this.content = '';
                            break;
                        case 'labyrinth_items':
                            this.content = (b[i].indexOf('<items/>') < 0) ? 'loot' : '';
                            const hasItems = b[i].indexOf('<items/>') < 0;
                            if (hasItems){
                            this.content = 'loot';
                            const roomId = this.ariadna.state.in_room.i;
                            const ind = this.ariadna.state.bots_met_indexes.indexOf(roomId);
                            if (ind > -1){
                                this.ariadna.state.bots_killed++;
                                this.ariadna.state.bots_met_indexes.splice(ind, 1);
                                this.ariadna.svg.header.bots.textContent = this.ariadna.state.bots_killed + ' / 19';
                                this.ariadna.saveContent();
                            }
                            }else{
                                this.content = '';
                            }
                            break;
                        case 'chat':
                            if (b[i].indexOf('<text>Там выход') >= 0) this.content = 'exit';
                    }
                }
                console.log('Вкладка: ' + this.tab + ' Контент: ' + this.content + ' Направление: ' + this.dir);
            },
            /*
                  has_bots:      function( rt ) { var a = /labyrinth bots="(.*)"/.exec(rt);  return (a ? a[1] : false);},
                  get_dir:       function( rt ) { var a = /look-direction="(\d*)"/.exec(rt); return (a ? a[1]-1 : 'undefined');},
                  chk_content:   function( rt )
                  {  var b = rt.split('block name="'), i;
                     for ( i=b.length-1; i>0; i--)
                     {  var obj;
                        switch( b[i].substr(0, b[i].indexOf('"')))
                        {
                        case 'labyrinth_background':
                           break;

                        case 'labyrinth_movement':
                           this.label = (obj = /label\>(.*?)\<\/label/.exec(b[i])) ? obj[1] : '';

                           if (obj = /fountain type="(\d*)"/.exec(b[i]))
                              return ( this.ariadna.sources[ obj[1] - 1] + ':' + /cnt_drinks="(\d*)"/.exec(b[i])[1]);
                           if (obj = /labyrinth bots="(.*?)"/.exec(b[i]))
                              if (obj[1] != '') return ( 'b:' + obj[1] );
                           if (b[i].indexOf('<has_items>1') >=0 )
                              return 'loot';
                           return '';

                        case 'labyrinth_items':
                           return (b[i].indexOf('<items/>') < 0 ? 'loot':'');

                        case 'chat':
                           if ( b[i].indexOf('<text>Там выход') >=0 )
                              return 'exit';
                        }
                     }
                     return 'undefined';
                  }
            */
        }
        window.lb.at_tunnel = false;



        // АРИАДНА - ОБЪЕКТ-КАРТА

        function Ariadna() {
            // константы

            this.psgID = ['v', 'r', 'h', 'l', 'v', 'r', 'h', 'l']; // коды туннелей
            this.psgGR = ['l', 'r', 'r', 'r', 'r', 'l', 'l', 'l']; // направления градиентов
            this.psgDX = [0, 1, 1, 1, 0, -1, -1, -1]; // смещения туннелей в матрице
            this.psgDY = [-1, -1, 0, 1, 1, 1, 0, -1];
            this.psgNm = ['С', 'С-В', 'В', 'Ю-В', 'Ю', 'Ю-З', 'З', 'С-З'];
            this.sources = ["relax", "cure", "luck", "drive", "attention"];

            // настройки

            this.set = {
                wnd: // настройки окна
                {
                    color: "#FFFFFF",
                    background: "#000000",
                    opacity: +0.3,
                    header: {
                        height: +26,
                        color: "#FFFFFF",
                        background: "#000000",
                        opacity: +0.6
                    },
                    border: {
                        width: +5
                    },
                    footer: {
                        height: +10,
                        color: "#FFFFFF"
                    },
                    offset: {
                        top: +window.getSetting('wnd_offset_t') || +15,
                        left: +window.getSetting('wnd_offset_l') || +10
                    },
                    size: {
                        min: {
                            width: +400,
                            height: +400
                        },
                        width: +window.getSetting('wnd_size_w') || +400,
                        height: +window.getSetting('wnd_size_h') || +400
                    }
                },
                map: // настройки карты
                {
                    matrix: +30,
                    rotate: 0,
                    scale: 1,
                    wall: {
                        thickness: +2,
                        color: "#a53309"
                    },
                    room: {
                        radius: +15,
                        background: {
                            show: "#FFFFFF",
                            hide: "#AAAAAA",
                            active: "#FFFFE0",
                            exit: "#d9faff"
                        }
                    },
                    tunnel: {
                        width: +6,
                        time: +20
                    },
                    look: {
                        radius: +20,
                        angle: +60,
                        color: "#FFFFE0",
                        opacity: +0.8
                    }
                }
            };
            this.set.wnd.clip = {
                dw: 2 * this.set.wnd.border.width,
                dh: 2 * this.set.wnd.border.width + this.set.wnd.header.height + this.set.wnd.footer.height
            };

            this.is_drag = 0;
            this.invisible = false;
            this.hidden = false;
            this.timer_marker = null;

            // объекты карты

            this.svg = {
                header: {
                    time: null, // document.getElementById('ariadna_header_time'),
                    rooms: null, // document.getElementById('ariadna_header_rooms'),
                    dir: null, // document.getElementById('ariadna_header_dir'),
                    scale_in: null, // document.getElementById('ariadna_header_scale_in'),
                    scale_out: null, // document.getElementById('ariadna_header_scale_out'),
                    scale: null, // document.getElementById('ariadna_header_scale'),
                    refresh: null, // document.getElementById('ariadna_header_refresh')
                    close: null, // document.getElementById('ariadna_header_close')
                    bots: null
                },
                clip_rect: null, // document.getElementById('ariadna_clip_rect'),
                layer: {
                    shift: null, // document.getElementById('ariadna_map_layer_shift'),
                    scale: null, // document.getElementById('ariadna_map_layer_scale'),
                    places: null, // document.getElementById('ariadna_map_layer_places'),
                    tunnels: null, // document.getElementById('ariadna_map_layer_tunnels'),
                    rooms: null, // document.getElementById('ariadna_map_layer_rooms'),
                    contents: null, // document.getElementById('ariadna_map_layer_contents'),
                    dir: null, // document.getElementById('ariadna_map_layer_dir'),
                    run: null, // document.getElementById('ariadna_map_layer_run')
                    marker: null
                },
                SVGNS: 'http://www.w3.org/2000/svg',
                XLINKNS: 'http://www.w3.org/1999/xlink',

                create: function (elm, attr) {
                    var obj = document.createElementNS(this.SVGNS, elm);
                    for (k in attr)
                        if (attr.hasOwnProperty(k)) obj.setAttributeNS(null, k, attr[k]);
                    return obj;
                },
                createRefs: function (elm, href, attr) {
                    var obj = this.create(elm, attr);
                    obj.setAttributeNS(this.XLINKNS, 'xlink:href', href);
                    return obj;
                },
                createRect: function (attr) {
                    return this.create('rect', attr);
                },
                createUse: function (href, attr) {
                    return this.createRefs('use', href, attr);
                },
                createImage: function (href, attr) {
                    return this.createRefs('image', href, attr);
                },
                createLG: function (id, p1, c1, p2, c2) {
                    var obj1 = document.createElementNS(this.SVGNS, 'linearGradient'),
                        obj2 = document.createElementNS(this.SVGNS, 'stop'),
                        obj3 = document.createElementNS(this.SVGNS, 'stop');
                    obj1.setAttribute('id', id);
                    obj2.setAttribute('offset', p1 + '%');
                    obj2.setAttribute('stop-color', c1);
                    obj1.appendChild(obj2);
                    obj3.setAttribute('offset', p2 + '%');
                    obj3.setAttribute('stop-color', c2);
                    obj1.appendChild(obj3);
                    return obj1;
                }

            };

            // списки комнат
            // индекс комнаты = 256*y+x

            this.xy2index = function (x, y) {
                return Number(y) << 8 | Number(x);
            }
            this.index2xy = function (index) {
                return {
                    x: index & 0xFF,
                    y: index >> 8
                };
            }
            //   this.xy2index = function(x,y)   { return Number(y) * 100 + Number(x); }
            //   this.index2xy = function(index) { return { x: index % 100, y: Math.floor(index/100) }; }
            this.chk_link = function (from, to) {
                var dx = to.x - from.x,
                    dy = to.y - from.y;
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) return -1; // комната недоступна
                var tdx = dx / 2,
                    tdy = dy / 2, // координаты туннеля
                    ti = this.xy2index(from.x + tdx, from.y + tdy),
                    d = [
                        [7, 6, 5],
                        [0, 0, 4],
                        [1, 2, 3]
                    ][tdx + 1][tdy + 1]; // требуемое направление
                if (ti in this.state.rm_links && this.psgID[d] in this.state.rm_links[ti])
                    return d;
                return -1;
            }
            this.is_visited = function (idx) {
                idx = idx || this.state.in_room.i; /* idx не 0 и не false, проверяем на undefined  */
                return (idx in this.state.rm_conts && this.state.rm_conts[idx] != "hide");
            }
            this.is_tunnel_xy = function (x, y) {
                return ((x % 2 + y % 2) > 0);
            }
            this.is_tunnel_i = function (idx) {
                var xy = this.index2xy(idx);
                return ((xy.x % 2 + xy.y % 2) > 0);
            }

            this.state = {
                rm_links: {},
                rm_conts: {},
                rm_opened: 0,
                in_room: {
                    x: 128,
                    y: 128,
                    i: 0,
                    d: 0,
                    is_tunnel: function () {
                        return ((this.x % 2 + this.y % 2) > 0);
                    }
                },
                t: new Date(),
                bots_killed: 0,
                bots_met_indexes: []
            }
            this.state.in_room.i = this.xy2index(this.state.in_room.x, this.state.in_room.y);
            this.position_index = function () {
                return this.state.in_room.i;
            }

            // графические параметры карты (запоминаются с картой)

            this.px = {
                shift: {
                    x: 0,
                    y: 0
                },
                rotate: 0,
                scale: {
                    x: 0,
                    y: 0,
                    s: 1.0
                }
            };


            // СОЗДАНИЕ/УНИЧТОЖЕНИЕ

            this.createWindow = function () {
                if ('ariadna' in this) this.destroyWindow();
                window.jQuery('body').append('<div id="ariadna" style="position: absolute; z-index:1;"><style type="text/css">#ariadna text { font: bold 16px/26px Arial; }</style><svg id="ariadna_map" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" version="1.1"></svg></div>');
                this.ariadna = document.getElementById('ariadna');
                this.ariadna.obj = this;
                this.ariadna = window.jQuery(this.ariadna);
                this.ariadna.css({
                    width: this.set.wnd.size.width + 'px',
                    height: this.set.wnd.size.height + 'px',
                    top: this.set.wnd.offset.top + 'px',
                    left: this.set.wnd.offset.left + 'px',
                    display: 'none'
                });

                var svg = document.getElementById('ariadna_map'),
                    defs = document.createElementNS(this.svg.SVGNS, 'defs'),
                    obj1, obj2, i, j;

                // + обесцвечивание для пустых ресурсов

                obj1 = this.svg.create('filter', {
                    id: 'grey-filter',
                    filterUnits: 'userSpaceOnUse',
                    x: 0,
                    y: 0,
                    width: 16,
                    height: 16
                });
                obj2 = this.svg.create('feColorMatrix', {
                    type: 'matrix',
                    'in': 'SourceGraphic',
                    values: '0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0'
                });
                obj1.appendChild(obj2);
                defs.appendChild(obj1);

                // + изображения и юзы ресурсов

                var imgs = {
                    drive: '\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAA3NCSVQICAjb4U/gAAACZklEQVQokY2RQUgUURzGv/fmjTOr62RrKZIkkUKdow4dOugtL0JFQdkhO0R2kIo6VEQHIYtOFXVwJeqSdaio\
qIgNCrqEt6QUlXbd1UzXmW12Z+fNzpv3OoxYx/7HP9/v+38ffzLy4mAq1YT/m9VVh6VSTTcvjCtJqAbuRYyRSkmIQAFgBkk2MaKRakkAxC+LG0+OUwBeKWrtNIrzwY69jZs6DBGoB+/P3352SgRKr6fJ\
ZhZUZcNGTdNJGIYUQLUkvn90H324OPHSmf1SefzpEqVUSnl19NDKjyD/tXrs8m57oabpxHVdCiBhMQC1Wi0OemTfMCFEKXXt5NN4EwQBAEpJpeIxACKUAHzOR98MGYbR3z3S3z0SS/uv7PF9n3MOgBAI\
IRiAkKu2LvNM371b4ydM0xx7d5YQksvn57LZcrnMOX97/4duUinBGGMxmmqv893o3OExAMMPj0ZRlM3nHcd5dWcGgG7ShKV5tkgmG2h8WkVq265ka6cJoLC4OJfN2rbt+z6AZDNr2MASjVrIpWVZFIBS\
aOuyVCT93xEA23GKxaLneWuNPQlAN0gYKF3XKYCgEs1NONOfy+5K2De007btuCWAnoH2kMuqK1ZyNSUVgLVIP2d4UJW9g53lcllKmUkXMunCOlPzZSTU38fpCRpyuf/09tg4ky4wgzKD/suIQOomXVr6\
xQAwnfQOdnLOYwUzaF09hUQMx0DPQHsmXZiammYAIqFe352NpayORKHybBFySQiYQTVG1o2cZZ9cf34AkJOT3wqzDoDmLWZHx9aWls2WZQFwXXd5eSWXm19d4ACoRv4APQlEuyW2LSAAAAAASUVORK5C\
YII=',
                    attention: '\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAA3NCSVQICAjb4U/gAAACaUlEQVQokY3Kb0gTYQDH8d/zPHe76cYls4RQCivSInwVvlpZGWEY2IuEdBTBrHwRKNGE8E0xrVRICcQ3aVaE\
NMuoMBES+kN/xCh8YVRIGdjYwrnddru7bXf39KKgMIi+r74vPqTr/iGPpwD/VywWFzyegp6229wmlMFIW4JAMrpNGGGMmFlbclFCiJYwAaKnzO7QUQFAOmE1d+wtLCzcUrb5+YuXupFxShK3LMEhxZaW\
CKULCwvpWGbmQRyAELr50EhZfS2T6ypcjPEv7zQAa8vyHE7ydVYD4Cl2bKp0uz0OgAMQ3j5K3JhqY4z5dl0EMPKs3TTNI3u6APSMHEuqqeDxu3NPksXleZbJAdCtVfLR6m5d168/DgBo2NnJGBuaPA0g\
0DCspjV/0JuOm+GPOqUkl8vR2novZaRpf19KVa9OtAJorLrAOe8dbQLQ2zphGEZ9oEJdNplII5EolWWZA26PcOrgQEJRroydBOCv6U0oij/oBXCr842maftOrOc2vzf0moqiaJu8aINTXi2eOXwt8j16\
dqAOwPmm0Xg8XtNcCmC8f96yrGp/SfiDLgDgHEbSSi7l/EFvOBIdPvcKQE1zqaIoU4OLAKr9JQCmBhelfCoAsC0e/qT72renUqlQ9+xPkcvlVmhBokUbncwQv0U/Z+oDFbquj12e+1Os0Ewg23avYkrU\
rGsp1zRtvH/+H1pyUUO1D/gqyQ7fmvdPkwAEiQIwM/bf78insKFEs5dCjbS23mvbECQCcCvHCSO/3vz96WUzEcmaWS6KIum4UycIVFXTACTJASCTya54t9sly7IoitPTMz8AgHUzjdtthPIAAAAASUVO\
RK5CYII=',
                    luck: '\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAA3NCSVQICAjb4U/gAAACIklEQVQokY2RT0hUQRzHvzNv1l1XEdnAS6JFgSuBQYdOEYGQUJeIIooMyiioiwZ5WIgOEVZCCVGHpaVDQSye\
OpQVeNhD3joYkgoGpnsw3eeu81rnzXvzp8Nbtk06NKdhft/f7/v7fIc8fHsmlWrH/x3XLbNUqn18NG8N2ebK93S9FkvQ0DfRnTURJ0aFpx/lBxmAakXvPdQyX5BvChlCiDZGSnll4PGTyatbnFc4nxj5\
kGwjoU/CMKQABNfzBf5iajhUygLMcRhj0WwZyG0hLt05zEsKwNraTwqAEDx4PbjFOfe880fva60dxwFgrRW+n80UpJSnhnuNtgsLi7RGUymXNt310sbYq4sXjo0JIQAopSZGPp4bPehL6fs+gPWVas26\
5G5aawEQQobuHfkyOwtgaXn59K0D3POCIIhkgTAMAKHk5d2ZHQmevd2XzRQaX1icNjXTmsPu3maj4Fd1tawCYU7e3D85/nXg+h6lVL1hOleMJSgFoJXt7mtt62BKmkCY49e63z1bihimc8VGk9A3FIDR\
dia/sfjZ81zVP9T5KfuDxWth9A91NvbUGFiMnLixTymltZ7OFVmcJlrpL2nqPX+RRA7vn3//Q5akxuyIANGgGnQozK6uuNEWIMQBJdDmH2qHkY6uFgZAKeuuSOKQ6NeNstogkaT17SO1rOp0uoe5bvnp\
1OWdGwCu687NfSsulQNhmpppR1dLOt2zulr8DS2MHfYXk0AqAAAAAElFTkSuQmCC',
                    relax: '\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAA3NCSVQICAjb4U/gAAACtUlEQVQokQXBy2tUVxwA4N953jv3DpNkHJ1kEieJJkEpGqyIlIKb0KWrUvAf6LKL0q30byh0003BnSuX7aIP\
CqWLIrUPJcVosDrTiZPcmd4793XOPc9+H7p376PJyVvKmHe+04miVlzUNcUIAFSjAQMG4GHgAGQtnDFkbbi+txscvHc5c0mRQYCBE4QokY2M4lbASBzHZZl7Z6Io7p5bxpzh0zM1x739lT4iZ6/GE2E9\
b0W7l7dlYywilFNGaafdMUoK2WCjbZXD+Plvn9z/4tc1lx1wUYs8y99MphSjIAzTdBFFcbZYaOuVqMm7N/eLukpn+kHy86o2t7a2nzVV+ffEOtcoKUSltOY8IJQJKUSjcC10r3dBW5s+PMzC/mQyunO9\
r69eKKuCAlZCMRbMZwtrzWCtH3BOru2/MxqPer2eMhqO0zMcOy4+fv/a4V9HcZ+fjrN5MtPOOG9FVTulyNrGQEvZyIZQ5o3T/87v3vmgZ6r1PfawOF2+jfXesl9ZSZ78o7WmrYjs7uzUonIevLVSKe99\
Lk5epMcZFh9uDg82hwf9SzsLlw7DLlGqouTicL2oKoSw8z5uxwTj0XSerMZff/o5trMYn1M+uLFz6ftvvsuXOsWkwG/GY2fMIk2llNl8XhV5k1T714d16fKqDQArUD86+uWY/uc23zZSYeTBe2eM0Vrn\
ZVXXDYQ4ab96MvqhuzVIePV6or58/eNSVwGANYZSQpS2UbutlQp5oLWOObv9R/9ZdbRa4q+ef/s0mcIhvXL//OPPFEMMbVxcDwLuvccYeQ/W+qaRBMPe3Su/2xmaGn9CNnaL5CfJGPPekc5Sh1ICAAgh\
APAeEPIYk+nLs8H51VavO4js6Z8ZtZQQ4pxDW9tbTSMxwZiQOAwRQnlZMsqMMeAtJsRoyzhnjAjZMMr+Bxbwk9TKgfegAAAAAElFTkSuQmCC',
                    cure: '\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAA3NCSVQICAjb4U/gAAACq0lEQVQokXXBW28UVRwA8P/5n8vszOwsZbatlQoBahsuURJNxMT4psELhmgCpgGN3wFefPMDaHgi4WtwCSY8\
mRh9AEkMpLVJwbC02+72tjuzczmXOefwCfj9yPLy5b2DkeCBNioKW1EY5mXFkACAVgYQECAIWg5IXRfWWjaeFFOdaDAcpoe6PKCCurZAQ7CuqrAdUfCMBVk+IgTidpzEESJ1++Ns6Z2Tt27dXltd720N\
JZAwihYXTijVeCQiYJzRTtKxWpZS0bfm5i5d/G72yPyZ47NH+6+e7Y08MtM0eVmih6jdzrIsjqJxNnaEgjXkq28upGFy5dqP9PnK/Il3pz88/8P3l/fqMk1TShHAA8DhqQ44yCZF4yw9ubiwdzBaffL4\
4rlzf7x4gZx/8NH57fX1YZ7NdbtFVQWtcJJVXLDZmWmpFMZxLE0tEZd/u3n81OmylsXDu7/+fP3T2befrvxHkVaTLIgC0+jd3R1TKzo3f8RI1ZjGIzkUR+nWcHL/4fM7D7786erC/72/ykJqxXmwu7Nr\
dOMJks8vfDYa7xPCiHejLE+F+OW99wGgt7JGk7jQ+n5dZwGP2mFZyTho0WPH5idFCYSAh3aSSGunh/vhs7V+b7Pc3D777ReHN7YeyTpsxUpJqSUlFBmlVVmAJ1pJa83feXbPyCvTM1k++ffJ06mZ7mke\
/N576axFAjRNpxhDKTUgllVlrSOIjAsaR4txvJNPNvuDjy99vbF/MMgzpIwsLS04gEAIpTUCaNOIQDjnpJJW2xsiWhsMNrQ5msT87KkH230aRhGlxJiGEHDeeU+axlAkhCAT7E8tk6T9CaH9gL9EGFYl\
gzdDgkKIf5TqCLoq6PZ4TBFp2u3WUnrvrfctEXDOaqUJEGuds5ZS9B5eCdYIBh4Y568BNFVdm1JCs2wAAAAASUVORK5CYII='
                };

                for (i = this.sources.length - 1; i >= 0; --i) {
                    defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,' + imgs[this.sources[i]], {
                        id: 'ariadna_cont_src_' + this.sources[i],
                        width: 16,
                        height: 16
                    }));
                    defs.appendChild(this.svg.createRefs('use', '#ariadna_cont_src_' + this.sources[i], {
                        id: 'ariadna_cont_' + this.sources[i] + ':0',
                        transform: 'translate(-8,-8)',
                        filter: 'url(#grey-filter)',
                        opacity: 0.7
                    }));
                    defs.appendChild(this.svg.createRefs('use', '#ariadna_cont_src_' + this.sources[i], {
                        id: 'ariadna_cont_' + this.sources[i] + ':1',
                        transform: 'translate(-8,-8)'
                    }));
                    for (j = 2; j < 12; j++)
                        defs.appendChild(this.svg.createRefs('use', '#ariadna_cont_' + this.sources[i] + ':1', {
                            id: 'ariadna_cont_' + this.sources[i] + ':' + j
                        }));
                }

                defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wLAQ4WGRQpEJ0AAAAdaVRY\
dENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAAIJJREFUOMulU0EOwCAIK/z/NXyQHcZUVLTJTPRAKWBTBIDjOw4Bc6RzFADM7C0zAEeyB6f1dbiZ+Qu1d7273BJgyA4i4YpdR7xMdxyV\
+lolFisurzZToOh8LPRXxO49SZYGZLB2uC8ZPTBdyJgSq1hwJC3Tbak2u6I0ucA0BZl1nvIffijr58MhTS4AAAAASUVORK5CYII=', {
                    id: 'ariadna_cont_b:w',
                    width: 16,
                    height: 16,
                    transform: 'translate(-8,-8)' // големы слабые
                }));
                defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wLAQ4XEprg+FQAAAAdaVRY\
dENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAAIdJREFUOMulk1EOBCEIQx/e/zRcsPuxzo66gzYZE/2gFLApAYjriMA5cXMaQGYizcCOLH05v74SykxJCLje//uUWwIOWRgJR+w44mG6\
3aje1wqxbHF9tZ0CRedtobci3t4bXChBxGDt7r4Yjd6xtpJhSaxinRPTMp2W6mFXmk0usDYFnXVe8j+xow3Yb14dNgAAAABJRU5ErkJggg==', {
                    id: 'ariadna_cont_b:e',
                    width: 16,
                    height: 16,
                    transform: 'translate(-8,-8)' // големы норма
                }));
                defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAALGPC/xhBQAAAAZiS0dEAP8A/wD/oL2nkwAAAAlwSFlzAAALEwAACxMBAJqcGAAAAAd0SU1FB9wLAQ4XME+AubAAAAAdaVRY\
dENvbW1lbnQAAAAAAENyZWF0ZWQgd2l0aCBHSU1QZC5lBwAAAIZJREFUOMulU0EOwCAIK/z/NXywO6hzbihNZqIHSgFJawCIcQiDcmxyHAAiokUewInMzrn7EmBEkG0a9vd7s9wtoJAJIaHEyhGL6U6j\
al/bLEterr5tpcCm87HQ3yVO7T1USKBpeki7q2/ReccciYQtVXDuB1vMVJkq8YrL5A3mS1Cx8yv/AqAK6+eJ27sZAAAAAElFTkSuQmCC', {
                    id: 'ariadna_cont_b:s',
                    width: 16,
                    height: 16,
                    transform: 'translate(-8,-8)' // големы сильные
                }));
                defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAI9JREFUOI3N0rEKgVEchvFfDIpcgpHJbJbF4qJcg9EduAGjlMXoJqwyfGQglr/SV+qcT+Sps7yd5+kMh3+l\
jyUKnLDGMFXu4oh76VwxTgksQlihgzamse1SAoe43HvZmrFdUgJlGphHYJsrt7AJ+YxBbmAWcoFRrgz7CEyqyHCLQL1q4GOen+gttR895Is8AHhwIWqsLUuBAAAAAElFTkSuQmCC', {
                    id: 'ariadna_cont_hide',
                    width: 16,
                    height: 16,
                    transform: 'translate(-8,-8)' // hide
                }));
                defs.appendChild(this.svg.createRefs('image', 'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABGdBTUEAAK/INwWK6QAAABl0RVh0U29mdHdhcmUAQWRvYmUgSW1hZ2VSZWFkeXHJZTwAAAG9SURBVDjLpZO9apRREIafDVuIhMjGhPwJ\
ukashNjoNdgIqQQbG8U7ECy0i4UXIMQLEKxtrCwsRMRKbBSCoBhQwRjwZ3e/M/O+FufbTYRYZWA45wznnXk4Z6Zjm8PYFIe0LsDDG/1pm03jy5gpAzbIxga3q2wMv2Q/uPXo8wZAZ/P6qVmbrd7iyd7c\
Uh86HWhFMvvcpKBE4fv2B358+7Rx+/H23a7Nq+PL/d7c8ipf3r+kjH6jhDSkTAjCRoISZmbhNDMLq4S4c+/K8rmu8fzahYu8fvaEwc+dKm5FIZMJIVMSIsXu1ltmhw1nzq6x8/XjeteG+ZVF1q/dRKMh\
VqBInElG4igoApXxPlEJpo4t8eaF6drgEIPdd6j5g0KoqCYpSRShkq0LlZps+ugJZOjWxxEuSQ6zVohETZIh1LTiNqYQGTVmtwQqiUZBjgKVICfVsj0Ll7GwpYvcI1AkOSyUYTkQN4twCjWB0jgryYTA\
jYhRkIPyH1zVilETOV19QlCSHAQ5bA7GTaEUDuFxZ9EmsCGLOLJyvv5AGmvvstVWlGt/7zNjOvevrjy1uST90+8Hz4HBVYkrwfPOYcf5L9lR/9+EMK8xAAAAAElFTkSuQmCC', {
                    id: 'ariadna_cont_loot',
                    width: 16,
                    height: 16,
                    transform: 'translate(-8,-8)' // loot
                }));



                // + образцы туннелей

                var wc = 2 * (this.set.map.matrix - this.set.map.room.radius + this.set.map.wall.thickness),
                    wg = Math.floor(2 * (this.set.map.matrix * Math.sqrt(2) - this.set.map.room.radius + this.set.map.wall.thickness));
                tc = 'translate(' + -Math.floor(0.5 * wc) + ',' + -Math.floor(0.5 * this.set.map.tunnel.width) + ')';
                tg = 'translate(' + -Math.floor(0.5 * wg) + ',' + -Math.floor(0.5 * this.set.map.tunnel.width) + ')';

                defs.appendChild(this.svg.createRect({
                    id: 'ariadna_link_h',
                    width: wc,
                    height: this.set.map.tunnel.width,
                    transform: 'rotate(  0),' + tc
                }));
                defs.appendChild(this.svg.createRect({
                    id: 'ariadna_link_v',
                    width: wc,
                    height: this.set.map.tunnel.width,
                    transform: 'rotate( 90),' + tc
                }));
                defs.appendChild(this.svg.createRect({
                    id: 'ariadna_link_r',
                    width: wg,
                    height: this.set.map.tunnel.width,
                    transform: 'rotate(-45),' + tg
                }));
                defs.appendChild(this.svg.createRect({
                    id: 'ariadna_link_l',
                    width: wg,
                    height: this.set.map.tunnel.width,
                    transform: 'rotate( 45),' + tg
                }));

                // + линейные градиенты туннелей

                defs.appendChild(this.svg.createLG('ariadna_lg_cl-cl', 20, this.set.map.room.background.show, 80, this.set.map.room.background.show));
                defs.appendChild(this.svg.createLG('ariadna_lg_cl-hd', 20, this.set.map.room.background.show, 80, this.set.map.room.background.hide));
                defs.appendChild(this.svg.createLG('ariadna_lg_hd-cl', 20, this.set.map.room.background.hide, 80, this.set.map.room.background.show));
                defs.appendChild(this.svg.createLG('ariadna_lg_cl-ex', 20, this.set.map.room.background.show, 80, this.set.map.room.background.exit));
                defs.appendChild(this.svg.createLG('ariadna_lg_ex-cl', 20, this.set.map.room.background.exit, 80, this.set.map.room.background.show));

                // уголок окна

                defs.appendChild(this.svg.create('path', {
                    id: "ariadna_corner",
                    d: "M-10,0 L0,-10 M0,-6 L-6,0 M-2,0 L0,-2",
                    stroke: this.set.wnd.footer.color,
                    'stroke-width': 1.5
                }));
                svg.appendChild(defs);


                svg.appendChild(this.svg.createRect( // окно: подложка
                    {
                        id: 'ariadna_bg',
                        width: "100%",
                        height: "100%",
                        fill: this.set.wnd.background,
                        'fill-opacity': this.set.wnd.opacity
                    }));
                svg.appendChild(this.svg.createRect( // окно: хидер
                    {
                        id: 'ariadna_hd',
                        width: "100%",
                        height: this.set.wnd.header.height,
                        fill: this.set.wnd.header.background,
                        'fill-opacity': this.set.wnd.header.opacity
                    }));
                svg.appendChild(this.svg.createUse("#ariadna_corner", {
                    x: '100%',
                    y: '100%'
                })); // окно: уголок

                obj1 = this.svg.create('g', {
                    id: 'ariadna_header',
                    fill: this.set.wnd.header.color
                });
                obj1.appendChild(this.svg.header.time = this.svg.create('text', {
                    id: 'ariadna_header_time',
                    x: 10,
                    y: 19
                }));
                obj1.appendChild(this.svg.header.rooms = this.svg.create('text', {
                    id: 'ariadna_header_rooms',
                    x: 65,
                    y: 19
                }));
                obj1.appendChild(this.svg.header.dir = this.svg.create('text', {
                    id: 'ariadna_header_dir',
                    x: 125,
                    y: 19
                }));
                obj1.appendChild(this.svg.header.bots = this.svg.create('text', {
                    id: 'ariadna_header_bots',
                    x: 185,
                    y: 19
                  }));
                obj1.appendChild(this.svg.header.scale_in = this.svg.createImage(
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAABQElEQVR4AeyY0Q3CMAxEE3aAtWAf+IR9YC2WKFEIalTXlh1VQroeaiGcLSd3r189pJ19aBgdOAmTMFgCfKTBgAo7JCwiARNIGAyosEPCIhIwgYTBgAo7eyOcaFg8A2ACCYMBFXZIWEQCJpAwGFBhh4RFJGBCiPDj+Z42vV/KvKbfl/s1vZ6hW0eYhAxHBrt6J6Wr6XlZbvpSjvz/r+H+pL27tt7AX79DXY8ZbgeqE4a+Vgb07uo6p2zNrj1Ww3ptzPDgZvMRPAM8PfNE72rMsGe6hqfqOWl2NN2zpacnZPh6OWX3fVZ6q37MN2WWplv7eox+exJfAPyCgP0NPdIIKdAwAkXLAwlb6SDUSBiBouWBhK10EGokjEDR8kDCVjoINRJGoKh6KAUSLiFAXyQMjbeYI+ESAvRFwtB4i7ndEf4AAAD//1oqT1kAAAAGSURBVAMAPWKkeRzC5CkAAAAASUVORK5CYII=', {
                        id: 'ariadna_header_scale_in',
                        x: '63%',
                        y: 0,
                        width: 18,
                        height: 18,
                        transform: 'translate(-22,4)'
                    }));
                obj1.appendChild(this.svg.header.scale = this.svg.create('text', {
                    id: 'ariadna_header_scale',
                    x: '80%',
                    y: 19,
                    transform: 'translate(-80,0)'
                }));
                obj1.appendChild(this.svg.header.scale_out = this.svg.createImage(
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADwAAAA8CAYAAAA6/NlyAAAB/klEQVR4AeyY7VHDMAyGbXaAtWAf+En3KWvRIUyimFj+UIqai4QdccRxFFnSo9eFq5/cyX4MeHTBTWFTeLAOiG7py/U7XL6m63oLMJ+fp0uyp6LAABbmEYZ5In7JA4sj5gl1gX1ejMSTLrDCztYFlpC0yKELfIotjSFPsaUrSNyBYv8d8PgPtnTVgQMwU0hdYFnWmdrpAkMJsoMusOzHFzqrC2xbGkQ4dNBV+FC0dnADbvdlHKuowgp/oyqlRIGr7AoGUWCFf7tVS0lgfMiW5vnhW7LPB3P3ryp7NFBxPqcDPurdtv1GfnpI4FhLccNxGHphVzwvopePDNdiKa4zf8UExotj0DtVgRcMcS2eR9PjNyo5ZXf7vjxA7TA4F29V7b6ybBk8GQdWVcGorJTdcYE95F0G7/wygRHPwbA55N6pvJDFTCGif0iWR2fMLY0z4nkj/WaN+droWgTB1rAoj02F918fSeD3txe/63pd1n+gOFRR7TzPWX6IE2O2/Zd8v+/auRx3S1Nh+rGTCveDwKvUgHn96s/bFO5PM17FpjCvX/15m8L9acar2BTm9as/b1O4P814FaspnH8j5hW9x1sN2O+pesdaUWAtVdf+TBNRYC1VJ871VxR4zao4kQdWllkUGA7YGgdxkoKLAkuCUbkMmOrMKHZTeBQlKY4fAAAA//9HHlGhAAAABklEQVQDAFws4HlxSV6EAAAAAElFTkSuQmCC', {
                        id: 'ariadna_header_scale_out',
                        x: '80%',
                        y: 0,
                        width: 18,
                        height: 18,
                        transform: 'translate(-22,4)'
                    }));
                obj1.appendChild(this.svg.header.refresh = this.svg.createImage(
                    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAYAAAA7MK6iAAAACXBIWXMAAAsTAAALEwEAmpwYAAAEYElEQVR4nLVXWW8bVRQeURD8BJYiKMszEiBem8coaeLYM2OyUBLR4lRFecOO8TJLErtZihqChKBIlNjQUjeFBDu2Z+5MvaBEdEklmpZKdZqUkjpOTO2qqkSKiAedse7ENqlbt9MjXT945p5v7nfO+c65BFGj0XRgW7N18vkWe+itFkfwHYMz+uJONvYk8Tis0R56hWQFzsyjS60D8ZXO4Zm0ZWwuu+/z81lzv5wzOIN1ugIabeHtFCdO7h5KZqz+hY3BUE4ZidwqW/u/+C2vKzDJCB+1DcQyruPXN0qBhsN5xTO5prCBZYUJ/Kl8+NnZ26XAJrc419ofWy5d5j55tdkxfbfJHqqvGkMTi77Zc+hMbng6rwHav1/c6Do4m6F56aqZl2SaE8dpHvkoFkmNvcE38H6Kky6Xfiiw1OZJ/GVyC01VTwqgPV/N38Eb2cByocMbz5Ac+rrFGX71fkxVAlvHrxRMjBCpusnICvv3jp65iTfZfKl/KE6ah8y9H2AlMIQE+9lz6HSOZITOrUFt4e0QU0yvzbewTjIiqu8JP/2goBhYpdebyFt9qb/B19B0Tnm3P5bZ8gCQvTiRgF6SRRdqBcXAHd5E1uSIkiSHLvEn0+pBXMf+KFCcNFH2MsRu99AvGUwNxLQWekvNyESTLa7oLlz/7d74pt/BRKbJObVDexnEAeoUZy8kEvGQZuiNvFzOAPI7ji4VwHevP1UgOYHXHtIc+h2LQ+fITAa+lNDJgE3wWSytmwrNoYtFUDqwrc0TS+NMhDoldDaalxdHIsWkbfXE0qq2NzqCL4D2wp+gSGYeyXoDg0/wrTI6PJOGJkM0O6bf3jd2Pqtm84llxczLR/QHFr8F34DRPTaXhc5GwE/3YwYGaWVP3FCBLWPn1nY5fn5TpbprZFalemByTaF5GekNbO6T456pTaobPg49S1gs556qSK5F3YF5qSy5IKHVB5DiuJze17mcmuzR17o+/XUVdyqaR/PaQ5IR++3+BbXIHceWCiQvfVdNFGoxkkNHPjm6qIqTzZf618gIbu0hnLDjQFKTNpA53AJB/kAGH+q0zqkd7QcSmt/3BpPlkglG8egn9/Hr6qn7flwBSi4b3FGy3RtfA+GvFXQnG3uG4tBFduKG6tP5w7UNihNO/u/FBmfoJWhd0MKKDTy13uZJ5CEutQIDKMmJstW3cLeYtDm1LarCsZWRbPSDvaNntUEAN/NagIFKOKnNf3VdGwRGT+cpTuquutHEiILNl1LpwetBgBtdwdchkSCmmF5YPV9euEOx6HDVzQaX2AAxhS5yL2AY7GDAAzWieWmc5qUYzaOlroOzqzh7Mb0w8phZ6bBWt1tSZA/VwwgKo2jleAojq/ZxzmAdjLQw2oLEFhVpc77CiQQxNbHIQuhlBmewDob4ysEeWII67RhMZihOnLhnIhGPAAzXFri+wDUGtLd14NQKqB+Iw6OITVWDJg7zGFzYoLMZHZHnWJZ9olZH/wFkEcL1hiQiyQAAAABJRU5ErkJggg==', {
                        id: 'ariadna_header_refresh',
                        x: '90%',
                        y: 0,
                        width: 18,
                        height: 18,
                        transform: 'translate(-22,4)'
                    }));
                obj1.appendChild(this.svg.header.close = this.svg.createImage(
                    'data:image/png;base64,\
iVBORw0KGgoAAAANSUhEUgAAABIAAAASCAYAAABWzo5XAAAABHNCSVQICAgIfAhkiAAAA9pJREFUOI1VlM9vFGUch5/v+87M7uwPd1sg0OAvKIhBbYhRUn4fRAwGDOFgMMjRuyEePBoT/w8PmpREBeGA\
UQmSCgTjRcWGUhEo0JZuuzs7szvd3Zn3fT3syc/9uXzy5BGg6Hne1lqtdkBr/bw1RjsRcA4A6xzWGJxzWGsBQBBBcM410jT9zVp7x/M878XJyclPz549e2b//n00m6uI0igR0nSNKGqzvNJgpdEgjiOc\
tZSrZRg44jjh3Pnvbtz+84/PvfHx8cOnTn1wZmrq2/7Jkx/1avVqbp0gglMIogSlBBGNiGCdxeQZSZJ4J47uLb5/+sO99+bmDniVSuXZPM+yi5d+7X32xZWakjUMCl8HaKVRQOYcaZZBf0CWZ8TtZaLV\
FuemPoneOnSoKLhRb2ZmJjImlzD0s243opPcZ7SuaSWOXj9E/IBeP6c1WKWYtVk/UuPh/ALtOEf5gWk3GzjnfBUEQWWkPuKZ3GD6OdWS8N6xCQ4e2ERYiHk0/w9LCw+oF1JOHH+Zo0e2UgxzxPMRRHom\
xzqnlbXW76ZdEEsvS1lejllabLBvcidH3t5GvRRTK63yzsEX2TWxhb9nZll52oRBDxEnrXaMs1Z7ImLCMGSQD2gmq0QrPc59c52wFLBnzwTZoMfjJ4+oVBQXL17hytVZ0p6iVquilBZPAkA8D0iSJDEC\
uHxAsRCwuJry5ddXWVxa5JWd21m3ocQv125y+afbtCJFuVxH+QVEFEGlAIL2ADylscbQ7yYY7dM3lpXVJp1ul04nHoppHDa3WKXBQmdlnnyQSj70VjxrbTXpdrUoQQoBUfMJI6U+x9/dzZYXNnL12k3i\
Zov6aIUd28rM3evQ6XYYqW9GaR9jhrZ7eZ6r2btz4KzE7SaB7nP40A7Wjxa5dPlnpq/fIyyVefWlOtvHN1N5psv09Cxr3RKe1urB/EOcc+JZ53i6vII1OVHjMRs3BQQFn1u/32H61l06HbBeyF9zTURB\
KSxQLGrMYA0QGQxyrLXiCSLVSpksy5S1GQsLEV9N/UicpPTWFAW/gOm1acRr3IhiKkWftD0grAiDrC+FQnH4kVKSVKshY2Mbys3WAqVylU7aB/EJC0XEOQY4tHiQ+XQtOCU0W08YG1sXFAs+QN8zxtx+\
cP9h9ObuXfXvL5yPRZVzB0pkWABnrXJqWA/lBATAYfJEHzt+vBS3I5xziwKMrxsdPf3G6xMfb9/23Mharz9sj7FYazDGkZscZwy5MeAERKO1BuUzff3mD0tLSxcEqAObfd/fr7V+zTlbAefh8J3Dc6CG\
9P8mIBZ4mmXZDPDvf2S8AV4F7tXEAAAAAElFTkSuQmCC', {
                        id: 'ariadna_header_close',
                        x: '100%',
                        y: 0,
                        width: 18,
                        height: 18,
                        transform: 'translate(-22,4)'
                    }));
                svg.appendChild(obj1);

                (obj1 = this.svg.create('clipPath', {
                    id: 'ariadna_clip',
                    x: 0,
                    y: 0
                })).appendChild(
                    this.svg.clip_rect = this.svg.createRect({
                        id: 'ariadna_clip_rect',
                        x: this.set.wnd.border.width,
                        y: this.set.wnd.header.height + this.set.wnd.border.width,
                        width: this.set.wnd.size.width - this.set.wnd.clip.dw,
                        height: this.set.wnd.size.height - this.set.wnd.clip.dh
                    })
                );
                svg.appendChild(obj1);

                // слои карты

                svg.appendChild(obj1 = this.svg.create('g', {
                    id: 'ariadna_map_layer',
                    'clip-path': 'url(#ariadna_clip)'
                }));
                obj1.appendChild(this.svg.layer.shift = this.svg.create('g', {
                    id: 'ariadna_map_layer_shift'
                }));
                with(this.svg.layer) {
                    shift.appendChild(scale = this.svg.create('g', {
                        id: 'ariadna_map_layer_scale'
                    }));
                    scale.appendChild(places = this.svg.create('g', {
                        id: 'ariadna_map_layer_places',
                        fill: 'none',
                        stroke: this.set.map.wall.color,
                        'stroke-width': 2 * this.set.map.wall.thickness
                    }));
                    scale.appendChild(tunnels = this.svg.create('g', {
                        id: 'ariadna_map_layer_tunnels',
                        fill: 'none',
                        stroke: this.set.map.wall.color,
                        'stroke-width': this.set.map.wall.thickness
                    }));
                    scale.appendChild(rooms = this.svg.create('g', {
                        id: 'ariadna_map_layer_rooms',
                        fill: this.set.map.room.background.show
                    }));
                    scale.appendChild(contents = this.svg.create('g', {
                        id: 'ariadna_map_layer_contents'
                    }));
                    scale.appendChild(dir = this.svg.create('g', {
                        id: 'ariadna_map_layer_dir',
                        visibility: 'hidden'
                    }));
                    scale.appendChild(run = this.svg.create('g', {
                        id: 'ariadna_map_layer_run',
                        visibility: 'hidden'
                    }));
                };

                // знак направления

                this.svg.layer.dir.appendChild(
                    this.svg.create('path', {
                        id: 'ariadna_map_layer_dir_path',
                        d: 'M-{x},-{y} A{r},{r} 1 0,1 {x} -{y}'.inject({
                            r: this.set.map.look.radius,
                            x: this.set.map.look.radius * Math.sin(Math.PI / 360 * this.set.map.look.angle), // 360 = 180 * 0.5 (берется угол в половину угла сектора)
                            y: this.set.map.look.radius * Math.cos(Math.PI / 360 * this.set.map.look.angle)
                        }),
                        stroke: this.set.map.look.color,
                        'stroke-width': 4,
                        'stroke-opacity': this.set.map.look.opacity,
                        fill: 'none'
                    })
                );

                // пульсер туннеля

                this.svg.layer.run.appendChild(obj1 = this.svg.create('circle', {
                    cx: 0,
                    cy: 0,
                    r: 4,
                    fill: this.set.map.look.color
                }));
                this.svg.layer.marker = obj1;
                //         obj1.appendChild( this.svg.create('animate', { attributeName:'r', from:4, to:8, dur:'1s', repeatCount:'indefinite'}));
                //         obj1.appendChild( this.svg.create('animate', { attributeName:'fill-opacity', from:1, to:0, dur:'1s', repeatCount:'indefinite'}));

                // ИНТЕРАКТИВНОСТЬ

                // обработчики окна карты

                this.ariadna.bind('mousedown.ariadna', function (e) {
                    var of = window.jQuery(this).offset(),
                        dx = e.pageX - of.left,
                        dy = e.pageY - of.top,
                        obj = this.obj;
                    obj.is_drag = 0;

                    if (dy < obj.set.wnd.header.height) // перетаскивание карты
                    {
                        obj.is_drag = 1;
                        window.jQuery(document).bind('mousemove.ariadna', function (e) {
                            obj.ariadna.css(obj.set.wnd.offset = {
                                top: e.pageY - dy,
                                left: e.pageX - dx
                            });
                            obj.saveWindow();
                            if ('ownerDocument' in e.target) e.target.ownerDocument.defaultView.getSelection().removeAllRanges(); // снимаем выделение текста
                            return false;
                        });
                        return;
                    }
                    if (window.jQuery(this).innerWidth() - dx < 10 // изменение размеров карты
                        &&
                        window.jQuery(this).innerHeight() - dy < 10) {
                        obj.is_drag = 2;
                        window.jQuery(document).bind('mousemove.ariadna', function (e) {
                            obj.setNewSize(e.pageX - of.left, e.pageY - of.top);
                            if ('ownerDocument' in e.target) e.target.ownerDocument.defaultView.getSelection().removeAllRanges();
                            return false;
                        });
                        return;
                    }
                    obj.is_drag = 3; // смещение карты
                    var sx = e.pageX,
                        sy = e.pageY;
                    window.jQuery(document).bind('mousemove.ariadna', function (e) {
                        obj.shiftMap(e.pageX - sx, e.pageY - sy);
                        sx = e.pageX;
                        sy = e.pageY;
                        if ('ownerDocument' in e.target) e.target.ownerDocument.defaultView.getSelection().removeAllRanges();
                        return false;
                    });
                });

                window.jQuery(document).bind('mouseup.ariadna', {
                    obj: this
                }, function (e) {
                    window.jQuery(document).unbind('mousemove.ariadna');
                    switch (e.data.obj.is_drag) {
                        case 1:
                        case 2:
                        case 3:
                    }
                    e.data.obj.is_drag = 0;
                });

                this.onMouseWheel = function (e) // масштабирование
                {
                    e = e || event;
                    var of = window.jQuery(this).offset();
                    dx = e.pageX - of.left,
                        dy = e.pageY - of.top;
                    var direction = e.deltaY > 0 ? -1 : 1;
                    this.obj.scaleMap(dx, dy, direction);
                }
                if (this.ariadna[0].addEventListener) {
                    this.ariadna[0].addEventListener("wheel", this.onMouseWheel, false);
                }

                // обработка элементов

                this.ariadna.bind('click.ariadna', function (e) {
                    var tgt = e.srcElement || e.target;
                    tgt = tgt.correspondingUseElement || tgt;

                    switch (tgt.id) {
                        case 'ariadna_header_close':
                            this.obj.hideWindow.call(this.obj, true);
                            return;
                        case 'ariadna_header_refresh':
                            window.saveSetting('map_state', '', 1);
                            location.reload();
                            return;
                        case 'ariadna_header_scale_in':
                            this.obj.scaleMap.call(this.obj, this.obj.set.wnd.size.width / 2, this.obj.set.wnd.size.height / 2, -1);
                            return;
                        case 'ariadna_header_scale_out':
                            this.obj.scaleMap.call(this.obj, this.obj.set.wnd.size.width / 2, this.obj.set.wnd.size.height / 2, 1);
                            return;
                        default:
                            var args = /_(c|r|f|t.?)(\d*)/.exec(tgt.id);
                            if (!args) return;
                            var idx = args[2];

                            switch (args[1]) {
                                case 'c': // контейнер
                                    if (idx == this.obj.state.in_room.i) // в текущей комнате
                                    {
                                        this.obj.useContainer.call(this.obj, idx); // используем контейнер
                                    } // иначе воспринимаем его как пол
                                    case 'r': // стена
                                    case 'f': // пол
                                        var d = this.obj.chk_link.call(this.obj,
                                            this.obj.state.in_room, this.obj.index2xy(idx));
                                        if (d >= 0)
                                            this.obj.onMoveTo.call(this.obj, d);
                                        break;
                                    case 't': // туннель
                                        break;
                            }
                    }
                });

                // инициализация

                this.updateTime();
                this.svg.header.scale.textContent = Math.floor(this.px.scale.s * 100) + '%';
                this.ariadna.css({
                    display: 'block'
                });
            }

            this.destroyWindow = function () {
                if (!('ariadna' in this)) return;
                this.ariadna.remove();
                this.ariadna.unbind('click.ariadna');
                this.ariadna.unbind('mousedown.ariadna');
                window.jQuery(document).unbind('mouseup.ariadna');
                this.ariadna[0].removeEventListener("mousewheel", this.onMouseWheel, false);
                this.ariadna[0].removeEventListener("DOMMouseScroll", this.onMouseWheel, false);
                delete this.ariadna;
            }

            this.hideWindow = function (force) {
                if (force) this.invisible = true;
                this.ariadna.css({
                    display: 'none'
                });
            }

            this.showWindow = function (force) {
                if (this.invisible && !force) return;
                this.ariadna.css({
                    display: 'block'
                });
                this.invisible = false;
            }
            this.toggleWindow = function (force) {
                if (this.invisible) this.showWindow(force);
                else this.hideWindow(force);
            }



            // ОПЕРАЦИИ С КАРТОЙ

            // создание новой комнаты

            this.appendRoom = function (x, y, tunnels, content) {
                var m_rooms = [],
                    m_tunnels = [];
                m_rooms[this.xy2index(x, y)] = content;

                for (var i = 0; i < 8; i++) {
                    if (!(tunnels[i] || 0)) continue;

                    var idx1 = this.xy2index(x + this.psgDX[i], y + this.psgDY[i]), // индекс туннеля
                        idx2 = this.xy2index(x + 2 * this.psgDX[i], y + 2 * this.psgDY[i]); // индекс комнаты, куда ведет туннель

                    if (!(idx1 in this.state.rm_links) // на карте нет туннелей вообще
                        ||
                        !(this.psgID[i] in this.state.rm_links[idx1])) // или есть, но другой
                    {
                        m_tunnels[idx1] = m_tunnels[idx1] || {};
                        m_tunnels[idx1][this.psgID[i]] = false;
                        if (!(idx2 in this.state.rm_conts)) // с той стороны нет комнаты
                            m_rooms[idx2] = 'hide'; // создаём скрытую
                        continue;
                    }
                    // туннель есть, значит комната на том конце тоже

                    m_tunnels[idx1] = m_tunnels[idx1] || {};
                    m_tunnels[idx1][this.psgID[i]] = false;
                }
                this.drawMap({
                    r: m_rooms,
                    l: m_tunnels
                });
            }

            this.appendCurrentRoom = function (tunnels, content) {
                this.appendRoom(this.state.in_room.x, this.state.in_room.y, tunnels, content);
            }

            // апгрейд контента

            this.setContent = function (x, y, content, no_save) {
                try {
                    var i = this.xy2index(x, y);
                    document.getElementById('ariadna_c' + i).setAttributeNS(this.svg.XLINKNS, 'href', "#ariadna_cont_" + (this.state.rm_conts[i] = content));
                    if (!no_save) this.saveContent();
                } catch (e) {
                    /* TODO Отпостить ошибку */
                }
            }
            this.setCurrentContent = function (content) {
                this.setContent(this.state.in_room.x, this.state.in_room.y, content);
            }

            // отрисовка выхода

            this.setExit = function (dir) {
                if (typeof dir === 'undefined') dir = this.state.in_room.d;
                var x = this.state.in_room.x + 2 * this.psgDX[dir],
                    y = this.state.in_room.y + 2 * this.psgDY[dir],
                    idx = this.xy2index(x, y); // индекс комнаты, куда ведет туннель

                var m_rooms = [],
                    m_tunnels = [];
                m_rooms[idx] = 'exit';

                for (var i = 0; i < 8; i++) // отметим все туннели из комнаты
                {
                    var it = this.xy2index(x + this.psgDX[i], y + this.psgDY[i]);
                    if (it in this.state.rm_links) m_tunnels[it] = this.state.rm_links[it];
                }
                this.drawMap({
                    r: m_rooms,
                    l: m_tunnels
                });
            }

            // отрисовка карты
            // принимает объект с двумя массивами - комнат и туннелей

            this.drawMap = function (list, no_save) {
                var SVGNS = this.svg.SVGNS,
                    XLINKNS = this.svg.XLINKNS,
                    m_rooms = list.r,
                    m_tunnels = list.l;

                if (list.bots_met_indexes && list.bots_met_indexes.length > 0){
                    this.state.bots_met_indexes = list.bots_met_indexes;
                }
                    
                if (list.bots_killed){
                    this.state.bots_killed = list.bots_killed;
                }

                // периметры комнат

                for (var i in m_rooms) {
                    if (!m_rooms.hasOwnProperty(i)) continue;

                    if (!(i in this.state.rm_conts)) // стен нет
                    {
                        var xy = this.index2xy(i);
                        this.svg.layer.places.appendChild(this.svg.create('circle', {
                            id: 'ariadna_r' + i,
                            cx: this.set.map.matrix * xy.x,
                            cy: this.set.map.matrix * xy.y,
                            r: this.set.map.room.radius
                        }));
                    }
                    this.state.rm_conts[i] = m_rooms[i]; // обновим тип комнаты
                }

                // туннели

                for (var i in m_tunnels) {
                    if (!m_tunnels.hasOwnProperty(i)) continue;
                    var map_obj = this.state.rm_links[i] = this.state.rm_links[i] || {};

                    // элемент списка туннелей - хэш, содержащий коды направлений

                    var o_tunnel = m_tunnels[i];
                    for (var t in o_tunnel) {
                        if (!o_tunnel.hasOwnProperty(t)) continue;

                        var xy = this.index2xy(i),
                            elm;

                        if (t in map_obj)
                            elm = document.getElementById('ariadna_t' + t + i); // есть туннель на карте
                        else {
                            elm = document.createElementNS(SVGNS, 'use'); // туннеля нет, создаём
                            elm.setAttribute('id', 'ariadna_t' + t + i);
                            elm.setAttributeNS(XLINKNS, 'href', "#ariadna_link_" + t);
                            elm.setAttribute('x', this.set.map.matrix * xy.x);
                            elm.setAttribute('y', this.set.map.matrix * xy.y);
                            this.svg.layer.tunnels.appendChild(elm);
                            this.state.rm_links[i][t] = false;
                        }

                        // скорректируем градиент

                        var xy = this.index2xy(i),
                            x1 = {
                                h: xy.x - 1,
                                v: xy.x,
                                r: xy.x + 1,
                                l: xy.x - 1
                            } [t],
                            x2 = {
                                h: xy.x + 1,
                                v: xy.x,
                                r: xy.x - 1,
                                l: xy.x + 1
                            } [t],
                            y1 = {
                                h: xy.y,
                                v: xy.y - 1,
                                r: xy.y - 1,
                                l: xy.y - 1
                            } [t],
                            y2 = {
                                h: xy.y,
                                v: xy.y + 1,
                                r: xy.y + 1,
                                l: xy.y + 1
                            } [t],
                            i1 = this.xy2index(x1, y1),
                            i2 = this.xy2index(x2, y2),
                            f1 = {
                                hide: 'hd',
                                exit: 'ex'
                            } [this.state.rm_conts[i1]] || 'cl',
                            f2 = {
                                hide: 'hd',
                                exit: 'ex'
                            } [this.state.rm_conts[i2]] || 'cl',
                            sg = (t == 'r') ? f2 + '-' + f1 : f1 + '-' + f2;

                        elm.setAttribute('fill', 'url(#ariadna_lg_' + sg + ')');
                    }
                }

                // полы и содержимое

                for (var i in m_rooms) {
                    if (!m_rooms.hasOwnProperty(i)) continue;
                    var xy = this.index2xy(i),
                        elm;

                    if (i in this.state.rm_conts) // место уже есть
                    { // if ( this.state.rm_conts[i] != 'hide')     // комната не пустая
                        //   continue;

                        // пол

                        elm = document.getElementById('ariadna_f' + i);
                        if (!elm) {
                            elm = document.createElementNS(SVGNS, 'circle');
                            elm.setAttribute('id', 'ariadna_f' + i);
                            elm.setAttribute('cx', this.set.map.matrix * xy.x);
                            elm.setAttribute('cy', this.set.map.matrix * xy.y);
                            elm.setAttribute('r', this.set.map.room.radius);
                            this.svg.layer.rooms.appendChild(elm);
                        }
                        switch (m_rooms[i]) {
                            case 'hide':
                            case 'exit':
                                elm.setAttribute('fill', this.set.map.room.background[m_rooms[i]]);
                                break;
                            case 'b:w':
                            case 'b:e':
                            case 'b:s':
                                if (!this.state.bots_met_indexes.includes(i)){
                                    this.state.bots_met_indexes.push(i);                
                                }
                                this.state.rm_opened++;
                                break;
                            default:
                                if (xy.x != this.state.in_room.x || xy.y != this.state.in_room.y) elm.removeAttribute('fill');
                                this.state.rm_opened++;
              
                                const index = this.state.bots_met_indexes.indexOf(i);
                                if (index > -1){
                                  this.state.bots_killed++;
                                  this.state.bots_met_indexes.splice(index, 1);
                                }
                        }

                        // содержимое

                        elm = document.getElementById('ariadna_c' + i);
                        if (!elm) {
                            elm = document.createElementNS(SVGNS, 'use'),
                                elm.setAttribute('id', 'ariadna_c' + i);
                            elm.setAttribute('x', this.set.map.matrix * xy.x);
                            elm.setAttribute('y', this.set.map.matrix * xy.y);
                            this.svg.layer.contents.appendChild(elm);
                        }
                        elm.setAttributeNS(XLINKNS, 'href', "#ariadna_cont_" + m_rooms[i]);
                    }
                    // this.state.rm_conts[i] = m_rooms[i];
                }
                this.svg.header.rooms.textContent = this.state.rm_opened + ' / 30';
                this.svg.header.bots.textContent = this.state.bots_killed + ' / 19';
                if (!no_save) this.saveContent();
            }

            // установка активной комнаты

            this.setCurrent = function (x, y, dir, no_save) { // if (this.state.in_room.x == x && this.state.in_room.y && this.state.in_room.d == dir) return;

                if (this.state.in_room.i in this.state.rm_conts) {
                    document.getElementById('ariadna_f' + this.state.in_room.i).removeAttribute('fill');
                    this.svg.layer.dir.setAttribute('visibility', 'hidden');
                } else
                if (this.state.in_room.i in this.state.rm_links) {
                    this.svg.layer.run.setAttribute('visibility', 'hidden');
                    clearInterval(this.timer_marker);
                }
                var idx = this.xy2index(x, y);

                if (this.is_tunnel_xy(x, y)) {
                    if (idx in this.state.rm_links) {
                        (function () {
                            var steps = 10 * this.set.map.tunnel.time, // 10 фаз анимации в секунду на число секунд
                                interval = Math.floor(1000 * this.set.map.tunnel.time / steps),
                                length = document.getElementById('ariadna_link_' + this.psgID[dir]).getAttribute('width') - 2 * this.set.map.wall.thickness,
                                obj = this,
                                r = 4,
                                o = 1,
                                sx, sy, ldx, ldy;

                            switch (this.psgID[dir]) {
                                case 'r':
                                case 'l':
                                    length = Math.sqrt(length * length / 2); // от гипотенузы к катету
                                case 'h':
                                case 'v':
                                    sx = this.set.map.matrix * x - 0.5 * length * this.psgDX[dir];
                                    sy = this.set.map.matrix * y - 0.5 * length * this.psgDY[dir];
                                    ldx = length * this.psgDX[dir] / steps;
                                    ldy = length * this.psgDY[dir] / steps;
                            }
                            obj.timer_marker = setInterval(function () {
                                obj.svg.layer.run.setAttribute('transform', 'translate(' + sx + ',' + sy + ')');
                                obj.svg.layer.marker.setAttribute('fill-opacity', o);
                                obj.svg.layer.marker.setAttribute('r', r);
                                o -= 1 / 10;
                                r += 4 / 10; // приращение за 10 фаз
                                if (r > 8) {
                                    r = 4;
                                    o = 1;
                                }
                                sx += ldx;
                                sy += ldy;
                                if (!steps--) {
                                    clearInterval(obj.timer_marker);
                                    obj.svg.layer.run.setAttribute('visibility', 'hidden');
                                }
                            }, interval);

                        }).call(this);
                        this.svg.layer.run.setAttribute('visibility', 'visible');
                    }
                } else // комната
                {
                    if (idx in this.state.rm_conts) {
                        document.getElementById('ariadna_f' + idx).setAttribute('fill', this.set.map.room.background.active);
                        this.svg.layer.dir.setAttribute('transform',
                            'translate(' +
                            (this.set.map.matrix * x) + ',' +
                            (this.set.map.matrix * y) + '), rotate(' +
                            (45 * dir) +
                            ')'
                        );
                        this.svg.layer.dir.setAttribute('visibility', 'visible');
                    }
                }
                this.state.in_room = {
                    x: x,
                    y: y,
                    i: idx,
                    d: dir
                };
                this.svg.header.dir.textContent = this.psgNm[dir];
                if (!no_save) this.saveCurrent();
            }

            // повороты игрока

            this.setDir = function (dir) {
                if (dir == 'undefined') return;
                this.svg.layer.dir.setAttribute('transform',
                    'translate(' +
                    (this.set.map.matrix * this.state.in_room.x) + ',' +
                    (this.set.map.matrix * this.state.in_room.y) + '), rotate(' +
                    (45 * (this.state.in_room.d = dir)) +
                    ')'
                );
                this.svg.header.dir.textContent = this.psgNm[this.state.in_room.d];
            }
            this.turnDir = function (dir) {
                this.setDir(((this.state.in_room.d + dir) & 0x7));
            }

            // перемещение игрока

            this.moveTo = function (dir) {
                if (typeof dir == 'undefined') dir = this.state.in_room.d;
                this.setCurrent(this.state.in_room.x + this.psgDX[dir], this.state.in_room.y + this.psgDY[dir], dir);
                //         this.onMoveTo(dir);
            }

            this.moveToTunnel = function (dir) {
                if (typeof dir == 'undefined') dir = this.state.in_room.d;
                var nx = this.state.in_room.x + this.psgDX[dir],
                    ny = this.state.in_room.y + this.psgDY[dir];
                if (!this.is_tunnel_xy(nx, ny)) return false;
                this.setCurrent(nx, ny, dir);
                //         this.onMoveToTunnel(dir);
                return true;
            }

            this.moveToRoom = function (dir) {
                if (typeof dir == 'undefined') dir = this.state.in_room.d;
                var nx = this.state.in_room.x + this.psgDX[dir],
                    ny = this.state.in_room.y + this.psgDY[dir];
                if (this.is_tunnel_xy(nx, ny)) return false;
                this.setCurrent(nx, ny, dir);
                //         this.onMoveToTunnel(dir);
                return true;
            }

            // акции с содержимым

            this.useContainer = function (index) {
                var arr;
                try {
                    arr = this.state.rm_conts[index].split(':');
                } catch (e) {
                    console.log('useContainer: неверный индекс ' + index);
                    return false;
                }
                if (arr[1] == '0') return;
                switch (arr[0]) {
                    case 'relax':
                    case 'cure':
                    case 'luck':
                    case 'drive':
                    case 'attention':
                        this.onDrink();
                        break;
                    case 'b':
                        this.saveWindow(0);
                        setTimeout(this.onFight.call(this), 200);
                        break;
                    case 'loot':
                        this.onTakeLoot();
                        break;
                    case 'exit':
                    case 'hide':
                }
            }

            // КОЛБЭКИ



            this.onMoveTo = function (d) {
                console.log('onMoveTo');
            }
            this.onMoveToTunnel = function (d) {
                console.log('onMoveToTunnel');
            }
            this.onMoveToRoom = function (d) {
                console.log('onMoveToRoom');
            }
            this.onDrink = function () {
                console.log('onDrink');
            }
            this.onFight = function () {
                console.log('onFight');
            }
            this.onTakeLoot = function () {
                console.log('onTakeLoot');
            }

            // ОПЕРАЦИИ С ОКНОМ

            // обновление времени

            this.updateTime = function () {
                var dt = Math.floor((new Date() - this.state.t) / 60000); // разница в минутах
                this.svg.header.time.textContent = ('0' + Math.floor(dt / 60)).substr(-2) + ':' + ('0' + (dt % 60)).substr(-2);
            }

            // сдвиг карты

            this.shiftMap = function (dx, dy, no_save) {
                this.svg.layer.shift.setAttribute('transform',
                    'translate(' +
                    (this.px.shift.x += Math.floor(dx)) + ',' +
                    (this.px.shift.y += Math.floor(dy)) + '),rotate(0),scale(1)'
                );
                if (!no_save) this.saveWindow();
            }

            // смена размера карты

            this.setNewSize = function (w, h, no_save) {
                w = Math.max(this.set.wnd.size.min.width, w);
                h = Math.max(this.set.wnd.size.min.height, h);
                this.ariadna.css({
                    width: w + 'px',
                    height: h + 'px'
                });
                this.svg.clip_rect.setAttribute('width', w - this.set.wnd.clip.dw);
                this.svg.clip_rect.setAttribute('height', h - this.set.wnd.clip.dh);
                this.shiftMap((w - this.set.wnd.size.width) / 2, (h - this.set.wnd.size.height) / 2);
                this.set.wnd.size.width = w;
                this.set.wnd.size.height = h;

                if (!no_save) this.saveWindow();
            }

            // масштабирование карты с центром в указателе мыши

            this.scaleMap = function (dx, dy, delta, no_save) {
                // Вычитаем из dx:dy простое смещение, чтоб определить центр масштабирования
                dx -= this.px.shift.x;
                dy -= this.px.shift.y;

                var s = this.px.scale.s + 0.1 * delta, // новый масштаб
                    new_sdx = -dx * (s - 1), // новый компенсаторный сдвиг
                    new_sdy = -dy * (s - 1);

                if (s < 0.35 || s > 1.55) return;

                // чтоб карта не дергалась из-за нового центра,
                // мы должны компенсировать разницу в сдвигах от
                // разных центров масштабирования

                var cor_dx = -dx * (this.px.scale.s - 1),
                    cor_dy = -dy * (this.px.scale.s - 1);

                this.shiftMap(this.px.scale.x - cor_dx, this.px.scale.y - cor_dy);

                // теперь задаем новый масштаб

                this.svg.layer.scale.setAttribute('transform',
                    'translate(' +
                    (this.px.scale.x = new_sdx) + ',' +
                    (this.px.scale.y = new_sdy) + '),scale(' +
                    (this.px.scale.s = this.set.map.scale = s) +
                    ')'
                );
                this.svg.header.scale.textContent = Math.floor(s * 100) + '%';
                if (!no_save) this.saveWindow();
            }

            // Программное масштабирование на шаг (10%) относительно центра окна карты
            this.zoomStep = function (direction, no_save) {
                // direction: +1 — приблизить (на 10%), -1 — отдалить (на 10%)
                // Используем центр видимой области карты как точку масштабирования
                try {
                    var w = this.ariadna.innerWidth(),
                        h = this.ariadna.innerHeight();
                    var dx = Math.floor(w / 2),
                        dy = Math.floor(h / 2);
                    this.scaleMap(dx, dy, direction, no_save);
                } catch (e) {
                    // на случай, если окно ещё не создано
                    console.log('zoomStep error: ' + e);
                }
            }

            this.zoomIn = function (no_save) {
                this.zoomStep(1, no_save);
            }

            this.zoomOut = function (no_save) {
                this.zoomStep(-1, no_save);
            }


            // СЕРИАЛИЗАЦИЯ, СОХРАНЕНИЕ, ВОССТАНОВЛЕНИЕ

            this.saveWindow = (function () {
                var countdown, timer = 0,
                    obj = this;
                return function (c) {
                    countdown = c || 10;
                    if (!timer) {
                        timer = setInterval(
                            function () {
                                if (--countdown > 0) return;
                                window.saveSetting('wnd_offset_t', obj.set.wnd.offset.top, 1);
                                window.saveSetting('wnd_offset_l', obj.set.wnd.offset.left, 1);
                                window.saveSetting('wnd_size_w', obj.set.wnd.size.width, 1);
                                window.saveSetting('wnd_size_h', obj.set.wnd.size.height, 1);
                                window.saveSetting('wnd_scale', obj.set.map.scale, 1);
                                window.saveSetting('map_scale', window.JSON.stringify(obj.px.scale), 1);
                                window.saveSetting('map_shift', window.JSON.stringify(obj.px.shift), 1);

                                clearInterval(timer);
                                timer = 0;
                            }, 100)
                    }
                }
            }).call(this);

            this.saveContent = function () {
                window.saveSetting('map_state', window.JSON.stringify({
                    r: this.state.rm_conts,
                    l: this.state.rm_links,
                    bots_met_indexes: this.state.bots_met_indexes,
                    bots_killed: this.state.bots_killed
                }), 1);
            }
            this.saveCurrent = function () {
                window.saveSetting('map_current', window.JSON.stringify(this.state.in_room), 1);
            }

            // КОНЕЧНАЯ ИНИЦИАЛИЗАЦИЯ ОБЪЕКТА

            this.createWindow();

            var state = window.getSetting('map_state');
            if (state != '') // восстанавливанем состояние
            {
                this.drawMap(JSON.parse(state), true);
                var prm;
                prm = window.getSetting('wnd_time');
                if (prm != '') {
                    this.state.t = new Date(prm);
                    this.updateTime();
                }
                prm = JSON.parse(window.getSetting('map_shift'));
                this.shiftMap(parseFloat(prm.x), parseFloat(prm.y));
                prm = JSON.parse(window.getSetting('map_scale'));
                this.svg.layer.scale.setAttribute('transform',
                    'translate(' +
                    (this.px.scale.x = parseFloat(prm.x)) + ',' +
                    (this.px.scale.y = parseFloat(prm.y)) + '),scale(' +
                    (this.px.scale.s = this.set.map.scale = parseFloat(prm.s)) +
                    ')'
                );
                this.svg.header.scale.textContent = Math.floor(parseFloat(prm.s) * 100) + '%';

                this.state.in_room = JSON.parse(window.getSetting('map_current'));
                this.setCurrent(this.state.in_room.x, this.state.in_room.y, this.state.in_room.d);
            } else // новая карта
            {
                window.saveSetting('wnd_time', this.state.t, 1);

                var mx = Math.floor(0.5 * this.set.wnd.size.width),
                    my = Math.floor(0.5 * this.set.wnd.size.height);
                this.shiftMap(
                    mx - this.state.in_room.x * this.set.map.matrix,
                    my - this.state.in_room.y * this.set.map.matrix
                );
                this.appendCurrentRoom([], 'hide');
                this.setCurrent(this.state.in_room.x, this.state.in_room.y, this.state.in_room.d);
                var scale = window.getSetting('wnd_scale');
                if (isNaN(parseFloat(scale))){
                    scale = 1;
                }
                this.scaleMap(mx, my, 10 * (scale - 1.0), true);
            }

        }
        // ! АРИАДНА - ОБЪЕКТ-КАРТА

        window.lb.ariadna = new Ariadna();
        window.lb.ariadna.onMoveTo = function (d) {
            window.Labyrinth.moveTo(d + 1);
        }
        window.lb.ariadna.onFight = function (d) {
            window.Labyrinth.attack();
        }
        window.lb.ariadna.onDrink = function (d) {
            window.Labyrinth.drink();
        }

        // Подвязка к компасу

        window.jQuery('#labyrinth').bind('click.labyrinth', function (e) {
            var tg = e && e.target || event.srcElement;
            switch (tg.tagName) {
                case 'IMG':
                    if (tg.src.indexOf('compas') >= 0) {
                        window.lb.ariadna.toggleWindow(true);
                        return;
                    }
                    if (tg.hasAttribute('tab-name'))
                        switch (tg.getAttribute('tab-name')) {
                            case 'labyrinth_movement':
                                window.lb.tab = 0;
                                window.lb.ariadna.showWindow();
                                break;
                            case 'actions':
                                window.lb.tab = 1;
                            default:
                                window.lb.ariadna.hideWindow();
                        }
                    break;
            }
        });

        window.AJAX_LB_run_once = function () {};
    }
})();