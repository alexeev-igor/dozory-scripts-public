// ==UserScript==
// @name        timer-synchronization
// @description fix combats timers desync
// @namespace   dozory
// @version     1.2
// @grant       none
// @include     http://game.dozory.ru/cgi-bin/competitors.cgi*
// @run-at      document-end
// ==/UserScript==

(function() {
    'use strict';

    function getSecondsDiffWithMoscow(moscowTimeStr) {
        const now = new Date();

        function getMoscowOffset() {
            const moscowTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
            const utcTime = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
            return Math.round((moscowTime - utcTime) / (60 * 60 * 1000));
        }

        const todayISO = now.toISOString().split('T')[0];
        const offset = getMoscowOffset();
        const offsetStr = (offset >= 0 ? '+' : '-') + String(Math.abs(offset)).padStart(2, '0') + ':00';

        // Создаем дату, предполагая, что это СЕГОДНЯ
        let moscowDate = new Date(`${todayISO}T${moscowTimeStr}${offsetStr}`);
        console.log(`now: ${new Date()}`);
        console.log(`moscowDate: ${moscowDate}`);
        let diffInMs = moscowDate - now;

        // --- ЛОГИКА КОРРЕКТИРОВКИ ---
        // Если разница больше 12 часов (43200000 мс), значит мы ошиблись с днем.
        if (diffInMs < -43200000) {
            moscowDate.setDate(moscowDate.getDate() + 1);
            diffInMs = moscowDate - now;
        } else if (diffInMs > 43200000) {
            moscowDate.setDate(moscowDate.getDate() - 1);
            diffInMs = moscowDate - now;
        }

        return diffInMs;
    }

    function findCombatLogLinks() {
        const imgs = document.querySelectorAll('img[src*="i_log.gif"][title="Смотреть лог боя"]');

        return Array.from(imgs)
            .map(img => ({
                imgElement: img,
                linkElement: img.closest('a')
            }))
            .filter(item => item.linkElement && item.linkElement.href.includes('xml-show-combat-log&combat='))
            .map(item => {
                const href = item.linkElement.href;
                const match = href.match(/combat=(\d+)/);
                return {
                    href: href,
                    combatId: match ? match[1] : null,
                };
            });
    }


    function extractTimeFromHtml(xmlContent) {
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

            const messages = xmlDoc.getElementsByTagName('message');

            if (messages.length === 0) {
                return {
                    maxTime: null,
                    maxTurnnumber: null
                };
            }

            let maxTurnNumber = -1;
            let maxTime = null;
            let isEnd = false;

            for (let i = 0; i < messages.length; i++) {
                const message = messages[i];
                const timeAttribute = message.getAttribute('time');

                if (timeAttribute) {
                    const turnElement = message.getElementsByTagName('turn')[0];
                    let turnNumber = -1;

                    if (turnElement) {
                        turnNumber = parseInt(turnElement.getAttribute('number'));
                    } else {
                        const strongElements = message.getElementsByTagName('STRONG');
                        if (strongElements.length > 0) {
                            if (strongElements[0].textContent === 'БОЙ НАЧАТ'){
                                turnNumber = 0;
                            } else {
                                console.log(`Необработанный кейс, есть STRONG тег с контентом: ${strongElements[0].textContent}`);
                            }
                        } else {
                            const spanElements = message.getElementsByTagName('span');
                            if (spanElements.length > 0) {
                                // конец боя, спан-элементы с экспой
                                maxTime = timeAttribute;
                                isEnd = true;
                                break;
                            } else {
                                // начало боя (сообщение о нападе)
                                turnNumber = -1;
                            }
                        }
                    }

                    if (turnNumber >= -1) {
                        if (turnNumber >= maxTurnNumber) {
                            maxTurnNumber = turnNumber;
                            maxTime = timeAttribute;
                        }
                    }
                }
            }

            return {
                maxTime: maxTime,
                maxTurnNumber: maxTurnNumber,
                isEnd: isEnd
            };
        } catch (error) {
            console.error('Ошибка парсинга XML:', error);
            return null;
        }
    }

    async function fetchCombatData(url) {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const decoder = new TextDecoder('KOI8-R');
            const decodedString = decoder.decode(arrayBuffer);
            const turnInfo = extractTimeFromHtml(decodedString);
            return { url, turnInfo };
        } catch (error) {
            throw error;
        }
    }

    async function processAllCombatLogs() {
        const links = findCombatLogLinks();
        console.log(`Найдено боевых логов: ${links.length}`, links);

        if (links.length === 0) {
            return;
        }

        window.synced_combats = {};
        let lastUpdated = performance.now();
        window.update = function() {
            let now = performance.now();
            let delta = now - lastUpdated;
            lastUpdated = now;

            for (var i = 0; i < combats.length; i++) {
                var id = combats[i];
                if (combat_turns[id] === undefined || combat_turns[id] < 0) continue;
                
                // Если значение маленькое (например, < 1000), скорее всего это секунды от сервера.
                // предполагаем, что серверные секунды не могут быть больше 1000.
                if (combat_turns[id] < 1000 && !window.synced_combats?.[id]) {
                    combat_turns[id] *= 1000;
                }

                combat_turns[id] -= delta;
                
                if (combat_turns[id] < 0) {
                    jQuery('#countdown_' + id).html(getSec(0));
                    continue;
                }
                
                // Math.ceil для отображения целых секунд
                jQuery('#countdown_' + id).html(getSec(Math.ceil(combat_turns[id] / 1000)));
            }

            window.setTimeout(window.update, 100);
        };

        links.forEach(link => {
            fetchCombatData(link.href)
                .then(result => {
                    const id = link.combatId;
                    if (result.turnInfo.maxTime) {
                        const diffInMs = getSecondsDiffWithMoscow(result.turnInfo.maxTime);

                        if (window.combat_turns && window.combat_turns[id] !== undefined) {
                            console.log(`Текущее время: ${new Date()}`);
                            console.log(`Бой ${id}: синхронизация (время из лога: ${result.turnInfo.maxTime}, разница в мс: ${diffInMs})`);
                            
                            let totalTimeMs = 0;
                            if (result.turnInfo.isEnd) {
                                totalTimeMs = 49000;
                            } else if (result.turnInfo.maxTurnNumber === -1) {
                                totalTimeMs = 16000;
                            } else {
                                totalTimeMs = 89000;
                            }
                            
                            window.combat_turns[id] = totalTimeMs + diffInMs;
                            window.synced_combats[id] = true;

                            console.log(`Бой ${id}, обновленный клиентский таймер: ${window.combat_turns[id]}мс`);
                        }
                    } else {
                        console.log(`Бой ${id}: лог не содержит времени`);
                    }
                })
                .catch(error => {
                    console.error(`Ошибка при обработке боя ${link.combatId}:`, error);
                });
        });
    }

    processAllCombatLogs();

})();