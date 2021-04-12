// ==UserScript==
// @name        notifications-prof
// @namespace   dozory
// @include     http://game.dozory.ru/ajax.html*
// @include     http://game.dozory.ru/cgi-bin/main.cgi
// @version     1.12
// @grant       none
// @run-at      document-start
// ==/UserScript==

var localStorageName = 'dozory-notifications';

if (Notification.permission !== 'granted' && Notification.permission !== 'denied'){
    Notification.requestPermission();
}

function getNotifications(){
    var json = localStorage.getItem(localStorageName);
    var notifications = json != '' && json != null ? JSON.parse(json) : {};
    return notifications;
}

function saveNotifications(title, time){
    var notifications = getNotifications();
    notifications[time] = title;
    localStorage.setItem(localStorageName, JSON.stringify(notifications));    
}

function createNotification(title, endTime){
    if (!("Notification" in window)){
        return;
    }

    if (Notification.permission !== 'granted'){
        return;
    }

    var notifications = getNotifications();

    if (notifications[endTime]){
        return;
    }

    setTimeoutForNotification(title, endTime)
}

function setTimeoutForNotification(title, endTime){
    setTimeout(function(){
        new Notification(title);

        var notifications = getNotifications();

        delete notifications[endTime];

        localStorage.setItem(localStorageName, JSON.stringify(notifications));    

    }, endTime.getTime() - new Date().getTime());
}

(function(){
    var notifications = getNotifications();
    
    var currentDate = new Date();

    var toDelete = [];

    for (var prop in notifications){
        var notificationTitle = notifications[prop];
        var notificationDate = new Date(prop);

        var diffSeconds = notificationDate.getTime() - currentDate.getTime();

        if (diffSeconds <= 0){
            toDelete.push(prop);
        } else {
            setTimeoutForNotification(notificationTitle, notificationDate);
        }
    }

    toDelete.forEach(element => {
        delete notifications[element];
    });
    localStorage.setItem(localStorageName, JSON.stringify(notifications));
})();

if (window.location.href.includes('http://game.dozory.ru/ajax.html')){
    (function () {
        var origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function () {
            this.addEventListener('load', function () {
                var locationType = /\<window name=\"(.*?)\"\>/.exec(this.responseText);
    
                if (!locationType || locationType.length < 2){
                    return;
                }
    
                locationType = locationType[1];
    
                if (locationType !== 'office' && locationType !== 'factory'){
                    return;
                }
    
                var placeTitle = 'в офисе';
    
                if (locationType === 'factory') {
                    var subLocation = /\<block name=\"factory_body\" room=\"(.*?)\"\>/.exec(this.responseText)[1];
                    switch (subLocation){
                        case 'machine':
                            placeTitle = 'на заводе';
                            break;
                        case 'laboratory':
                            placeTitle = 'в лаборатории';
                            break;
                        default:
                            placeTitle = 'где-то'
                            break;
                    }
                }
    
                var endDateTime = /\<strtime_end\>(.*?)\<\/strtime_end\>/.exec(this.responseText)
                if (endDateTime != null && endDateTime.length > 1){
    
                    endDateTime = endDateTime[1];
                    var splittedDateTime = endDateTime.split(' ');
                    var splittedDate = splittedDateTime[0].split('-');
                    var splittedTime = splittedDateTime[1].split(':');
    
                    endDateTime = new Date(splittedDate[2], splittedDate[1] - 1, splittedDate[0], splittedTime[0], splittedTime[1], splittedTime[2]);
                    
                    var caption = /\<rcaption\>(.*?)\<\/rcaption\>/.exec(this.responseText);
    
                    var title = `${caption[1].trim()} ${placeTitle} закончилась`;
    
                    createNotification(title, endDateTime);
                    saveNotifications(title, endDateTime);
                }
            });
            origOpen.apply(this, arguments);
        };
    })();
}
