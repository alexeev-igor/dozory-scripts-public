// ==UserScript==
// @name        timer-synchronization
// @description fix combats timers desync
// @namespace   dozory
// @version     1.3
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
        let diffInMs = moscowDate - now;

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
                    maxTurnNumber: null
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

    window.synced_combats = {};
    let lastUpdated = performance.now();
    let calledReload = false;
    window.update = function() {
        let now = performance.now();
        let delta = now - lastUpdated;
        lastUpdated = now;
        
        for (var i = 0; i < combats.length; i++) {
            var id = combats[i];
            if (synced_combats[id] === undefined) 
                continue;

            if (calledReload && synced_combats[id] < 0)
                continue;
            
            if (!calledReload && synced_combats[id] <= 0){
                calledReload = true;
                location.reload();
            }
            
            synced_combats[id] -= delta;

            if (synced_combats[id] <= 0) {
                jQuery('#countdown_' + id).html(getSec(0));
                calledReload = true;
                synced_combats[id] = -1;
                continue;
            }

            jQuery('#countdown_' + id).html(getSec(Math.ceil(synced_combats[id] / 1000)));
        }

        window.setTimeout(window.update, 100);
    };
    
    async function processAllCombatLogs() {
        const links = findCombatLogLinks();

        if (links.length === 0) {
            return;
        }

        const MAX_RETRIES = 3;
        const RETRY_DELAY_MS = 1000;
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

        links.forEach(async (link) => {
            let attempt = 0;
            let success = false;
            let lastError = null;

            while (attempt < MAX_RETRIES && !success) {
                try {
                    if (attempt > 0) {
                        await delay(RETRY_DELAY_MS);
                    }

                    const result = await fetchCombatData(link.href);
                    const id = link.combatId;

                    if (result.turnInfo.maxTime) {
                        const diffInMs = getSecondsDiffWithMoscow(result.turnInfo.maxTime);

                        if (window.combat_turns && window.combat_turns[id] !== undefined) {
                            let totalTimeMs = 0;
                            if (result.turnInfo.isEnd) {
                                totalTimeMs = 49000;
                            } else if (result.turnInfo.maxTurnNumber === -1) {
                                totalTimeMs = 16000;
                            } else {
                                totalTimeMs = 89000;
                            }

                            window.synced_combats[id] = totalTimeMs + diffInMs;
                        }
                    }

                    success = true;
                } catch (error) {
                    attempt++;
                    lastError = error;
                    console.warn(`Ошибка при обработке боя ${link.combatId} (попытка ${attempt}/${MAX_RETRIES}):`, error);
                }
            }

            if (!success) {
                console.error(`Не удалось обработать бой ${link.combatId} после ${MAX_RETRIES} попыток. Последняя ошибка:`, lastError);
            }
        });
    }

    processAllCombatLogs();

})();
