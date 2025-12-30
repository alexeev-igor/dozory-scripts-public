// ==UserScript==
// @name        timer-synchronization
// @description fix combats timers desync
// @namespace   dozory
// @version     1.0
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
        let diffInSeconds = Math.floor((moscowDate - now) / 1000);

        // --- ЛОГИКА КОРРЕКТИРОВКИ ---
        // Если разница больше 12 часов (43200 сек), значит мы ошиблись с днем.
        // Если сейчас 02:00, а в Москве 00:00. Разница должна быть -2 часа (в идеале).
        // Но так как даты совпали, получилось -24 часа.

        if (diffInSeconds < -43200) {
            // Если время в Москве кажется сильно "прошлым", возможно, в Москве уже СЛЕДУЮЩИЙ день
            // или наоборот, у нас уже следующий день, а московская строка была для старой даты.
            // Добавляем 1 день к московской дате
            moscowDate.setDate(moscowDate.getDate() + 1);
            diffInSeconds = Math.floor((moscowDate - now) / 1000);
        } else if (diffInSeconds > 43200) {
            // Если время в Москве кажется сильно в будущем, вычитаем 1 день
            moscowDate.setDate(moscowDate.getDate() - 1);
            diffInSeconds = Math.floor((moscowDate - now) / 1000);
        }

        return Math.abs(diffInSeconds);
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

        const promises = links.map(link => fetchCombatData(link.href));

        try {
            const results = await Promise.allSettled(promises);

            results.forEach((result, index) => {
                const link = links[index];
                if (result.status === 'fulfilled') {
                    if (result.value.turnInfo.maxTime){
                        var dif = getSecondsDiffWithMoscow(result.value.turnInfo.maxTime);
                        console.log(`Бой ${link.combatId}: время = ${result.value.turnInfo.maxTime}`);
                        console.log(result.value.turnInfo);
                        console.log('dif', dif);
                        if (combat_turns && combat_turns[link.combatId]){
                            if (result.value.turnInfo.isEnd) {
                                combat_turns[link.combatId] = 49 - dif;
                            }
                            else if (result.value.turnInfo.maxTurnNumber == -1){
                                combat_turns[link.combatId] = 16 - dif;
                            }
                            else {
                                combat_turns[link.combatId] = 89 - dif;
                            }
                        }
                    } else {
                        console.log(`Бой ${link.combatId}: имеет null maxTime`);
                    }
                } else {
                    console.log(`Бой ${link.combatId}: ошибка = ${result.reason}`);
                }
            });

        } catch (error) {
            console.error('Ошибка при обработке боев:', error);
        }
    }

    processAllCombatLogs();

})();