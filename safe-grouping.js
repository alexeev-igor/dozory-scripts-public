// ==UserScript==
// @name        группировка предметов в сейфе
// @description Группирует одинаковые предметы в домашнем сейфе и позволяет переносить несколько экземпляров за один раз
// @namespace   dozory
// @version     1.0.0
// @grant       none
// @include     http://game.dozory.ru/cgi-bin/home.cgi*
// @run-at      document-end
// ==/UserScript==

(function () {
  'use strict';

  var STATIC_URL = window.STATIC_URL || 'http://st.dozory.ru';
  var HOME_INVENTORY_SELECTOR = '#home_inventory_items';
  var MIN_SAFE_WIDTH = 340;
  var MAX_SAFE_WIDTH = 600;
  var FRAME_GROWTH = 64;
  var MAIN_BASE_WIDTH = 585;
  var HOME_BASE_WIDTH = 811;
  var RIGHT_PANEL_WIDTH = 260;
  var MAIN_RESERVED_WIDTH = HOME_BASE_WIDTH - MAIN_BASE_WIDTH;
  var MAIN_RIGHT_GAP = 5;
  var SCRIPT_MARKER = '__dozorySafeGroupingInstalled';
  var transferInProgress = false;
  var originalWriteHomeInventory = null;
  var uiState = {
    query: '',
    sort: 'name',
    expandedGroups: Object.create(null)
  };

  if (window[SCRIPT_MARKER]) {
    return;
  }
  window[SCRIPT_MARKER] = true;

  function getInventoryItems(inventory) {
    var items = [];

    for (var index = 0; index < inventory.items_cnt; index++) {
      var item = inventory.get_item(index);
      if (item != null) {
        items.push({
          index: index,
          item: item
        });
      }
    }

    return items;
  }

  function getGroupKey(item) {
    return String(item.item_id || item.inventory_name || item.name || item.instance_id);
  }

  function groupHomeInventory() {
    var groupsByKey = Object.create(null);
    var groups = [];

    getInventoryItems(window.home_inventory).forEach(function (entry) {
      var key = getGroupKey(entry.item);
      var group = groupsByKey[key];

      if (!group) {
        group = {
          key: key,
          entries: []
        };
        groupsByKey[key] = group;
        groups.push(group);
      }

      group.entries.push(entry);
    });

    return groups;
  }

  function decodeHtmlEntities(value) {
    var textarea = document.createElement('textarea');
    textarea.innerHTML = value || '';
    return textarea.value;
  }

  function getGroupName(group) {
    var name = group.entries[0].item.name || group.entries[0].item.inventory_name || 'Предмет';

    // Создатель или источник подарка не меняют тип предмета.
    return decodeHtmlEntities(name).replace(/\s+\([^()]*\)\s*$/, '');
  }

  function getGroupDetails(group) {
    var details = [];
    var counts = Object.create(null);

    group.entries.forEach(function (entry) {
      var item = entry.item;
      var description = decodeHtmlEntities(item.inventory_name || item.name);

      if (!description) {
        return;
      }

      if (!counts[description]) {
        counts[description] = 0;
        details.push(description);
      }
      counts[description]++;
    });

    return details.map(function (description) {
      return counts[description] + '\u00d7 ' + description;
    }).join('\n');
  }

  function getEntryName(entry) {
    return decodeHtmlEntities(entry.item.inventory_name || entry.item.name || 'Предмет');
  }

  function getSearchText(group) {
    return (getGroupName(group) + '\n' + getGroupDetails(group)).toLowerCase();
  }

  function sortGroups(groups) {
    return groups.slice().sort(function (left, right) {
      if (uiState.sort === 'count') {
        var countDifference = right.entries.length - left.entries.length;
        if (countDifference !== 0) {
          return countDifference;
        }
      }

      if (uiState.sort === 'original') {
        return left.entries[0].index - right.entries[0].index;
      }

      return getGroupName(left).localeCompare(getGroupName(right));
    });
  }

  function findHomeInventoryIndex(instanceId) {
    for (var index = 0; index < window.home_inventory.items_cnt; index++) {
      var item = window.home_inventory.get_item(index);
      if (item && String(item.instance_id) === String(instanceId)) {
        return index;
      }
    }

    return -1;
  }

  function openItemDetails(item) {
    if (item.isGuide && item.isGuide()) {
      window.openwin('/cgi-bin/guide.cgi');
    } else if ((item.isBook && item.isBook()) || (item.isPbook && item.isPbook())) {
      window.openwin('/cgi-bin/book.cgi?id=' + encodeURIComponent(item.instance_id));
    } else {
      window.openwin('/cgi-bin/main.cgi?rm=trymix&i=' + encodeURIComponent(item.instance_id));
    }
  }

  function setBusyState(isBusy) {
    var container = document.querySelector(HOME_INVENTORY_SELECTOR);
    if (!container) {
      return;
    }

    Array.prototype.forEach.call(
      container.querySelectorAll(
        '.dozory-safe-quantity, .dozory-safe-move, .dozory-safe-max, ' +
        '.dozory-safe-item-move, .dozory-safe-delete'
      ),
      function (control) {
        var unavailable = control.getAttribute('data-unavailable') === 'true';
        control.disabled = isBusy || unavailable;
      }
    );
  }

  function transferItemsToPerson(group, quantity) {
    var availableSlots = window.person_inventory_capacity - window.person_inventory.items_cnt;
    var count = parseInt(quantity, 10);

    if (transferInProgress || window.now_ajax) {
      window.alert('Дождитесь завершения предыдущего переноса');
      return;
    }

    if (!isFinite(count) || count < 1) {
      window.alert('Укажите количество предметов от 1 до ' + group.entries.length);
      return;
    }

    count = Math.min(count, group.entries.length);

    if (count > availableSlots) {
      window.alert('В инвентаре свободно мест: ' + Math.max(availableSlots, 0));
      return;
    }

    var entries = group.entries.slice(0, count);
    var data = 'rm=take';

    entries.forEach(function (entry) {
      data += '&Inv=' + encodeURIComponent(entry.item.instance_id);
    });

    window.jQuery.ajax({
      url: '/cgi-bin/home.cgi',
      data: data,
      beforeSend: function () {
        transferInProgress = true;
        window.now_ajax = true;
        setBusyState(true);
      },
      complete: function () {
        transferInProgress = false;
        window.now_ajax = false;
        setBusyState(false);
      },
      success: function (message) {
        if (message !== 'Ok') {
          if (message) {
            window.alert(message);
          }
          return;
        }

        // После ответа повторно находим экземпляры по стабильным instance_id.
        // Это защищает от сдвига индексов, если параллельно обновился второй список.
        entries
          .map(function (entry) { return findHomeInventoryIndex(entry.item.instance_id); })
          .filter(function (index) { return index >= 0; })
          .sort(function (left, right) { return right - left; })
          .forEach(function (index) {
            window.person_inventory.add_item(window.home_inventory.get_item(index));
            window.home_inventory.drop_item(index);
          });

        window.write_person_inventory();
        window.write_home_inventory();
      },
      error: function () {
        window.alert('Не удалось перенести предметы. Попробуйте еще раз.');
      }
    });
  }

  function createImage(src, className, title) {
    var image = document.createElement('img');
    image.src = /^https?:\/\//i.test(src || '') ? src : STATIC_URL + src;
    image.alt = '';
    image.className = className || '';
    image.title = title || '';
    return image;
  }

  function getInstanceTooltipId(entry) {
    var stableId = entry.item.instance_id || ('index_' + entry.index);
    return 'dozory_safe_instance_' + String(stableId).replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  function bindInstanceTooltips(groups) {
    var hasGameTooltip = window.Tooltip && typeof window.Tooltip.bind === 'function';

    groups.forEach(function (group) {
      group.entries.forEach(function (entry) {
        var elementId = getInstanceTooltipId(entry);
        var element = document.getElementById(elementId);
        if (!element) {
          return;
        }

        if (!hasGameTooltip) {
          element.title = getEntryName(entry);
          return;
        }

        try {
          // Та же привязка, которую игра использует для исходного списка сейфа.
          window.Tooltip.bind(
            elementId,
            'over',
            'info',
            { width: 330 },
            'item_description',
            entry.item
          );
        } catch (error) {
          element.title = getEntryName(entry);
        }
      });
    });
  }

  function createIconButton(className, title, iconSrc, iconClassName) {
    var button = document.createElement('button');
    var icon = createImage(iconSrc, iconClassName || '', title);

    button.type = 'button';
    button.className = className;
    button.title = title;
    button.appendChild(icon);
    return button;
  }

  function createInstanceRow(entry, availableSlots) {
    var item = entry.item;
    var unavailable = availableSlots < 1;
    var row = document.createElement('div');
    var moveButton = createIconButton(
      'dozory-safe-item-move',
      'Перенести этот экземпляр в инвентарь',
      '/img/inventory/arr_right.png',
      'iePNG'
    );
    var name = document.createElement('button');
    var deleteButton = createIconButton(
      'dozory-safe-delete',
      'Выбросить этот экземпляр',
      '/img/combat/inventory/del_item.png',
      'iePNG'
    );

    row.className = 'dozory-safe-instance';

    moveButton.setAttribute('data-unavailable', unavailable ? 'true' : 'false');
    moveButton.disabled = unavailable || transferInProgress;
    moveButton.addEventListener('click', function () {
      transferItemsToPerson({ entries: [entry] }, 1);
    });

    name.type = 'button';
    name.className = 'dozory-safe-instance-name';
    name.id = getInstanceTooltipId(entry);
    name.textContent = getEntryName(entry);
    name.setAttribute('aria-label', getEntryName(entry) + '. Открыть описание экземпляра');
    name.addEventListener('click', function () {
      openItemDetails(item);
    });

    deleteButton.setAttribute('data-unavailable', 'false');
    deleteButton.addEventListener('click', function () {
      if (transferInProgress || window.now_ajax) {
        window.alert('Дождитесь завершения предыдущей операции');
        return;
      }

      var currentIndex = findHomeInventoryIndex(item.instance_id);
      if (currentIndex >= 0) {
        window.drop_item_from_home_inventory(currentIndex);
      }
    });

    row.appendChild(moveButton);
    row.appendChild(name);
    row.appendChild(deleteButton);
    return row;
  }

  function createGroupRows(group, availableSlots) {
    var item = group.entries[0].item;
    var groupName = getGroupName(group);
    var maximum = Math.min(group.entries.length, Math.max(availableSlots, 0));
    var unavailable = maximum === 0;
    var isExpanded = !!uiState.expandedGroups[group.key];
    var row = document.createElement('tr');
    var expandCell = document.createElement('td');
    var moveCell = document.createElement('td');
    var nameCell = document.createElement('td');
    var countCell = document.createElement('td');
    var quantityCell = document.createElement('td');
    var maxCell = document.createElement('td');
    var iconCell = document.createElement('td');
    var expandButton = document.createElement('button');
    var moveButton = createIconButton(
      'dozory-safe-move',
      'Перенести выбранное количество в инвентарь',
      '/img/inventory/arr_right.png',
      'iePNG'
    );
    var name = document.createElement('button');
    var quantity = document.createElement('input');
    var maxButton = document.createElement('button');
    var itemIcon = createImage(item.icon, '', '');
    var detailsRow = document.createElement('tr');
    var detailsCell = document.createElement('td');
    var details = document.createElement('div');

    function setExpanded(expanded) {
      uiState.expandedGroups[group.key] = expanded;
      expandButton.textContent = expanded ? '\u25be' : '\u25b8';
      expandButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      detailsRow.style.display = expanded ? '' : 'none';
    }

    row.className = 'dozory-safe-group';
    row.setAttribute('data-group-key', group.key);
    row.setAttribute('data-search-text', getSearchText(group));

    expandButton.type = 'button';
    expandButton.className = 'dozory-safe-expand';
    expandButton.title = 'Показать отдельные экземпляры';
    expandButton.addEventListener('click', function () {
      setExpanded(!uiState.expandedGroups[group.key]);
    });
    setExpanded(isExpanded);

    moveButton.setAttribute('aria-label', 'Перенести ' + groupName + ' в инвентарь');
    moveButton.setAttribute('data-unavailable', unavailable ? 'true' : 'false');
    moveButton.disabled = unavailable || transferInProgress;
    moveButton.addEventListener('click', function () {
      transferItemsToPerson(group, quantity.value);
    });

    name.type = 'button';
    name.className = 'dozory-safe-name';
    name.textContent = groupName;
    name.title = getGroupDetails(group);
    name.addEventListener('click', function () {
      setExpanded(!uiState.expandedGroups[group.key]);
    });

    quantity.type = 'number';
    quantity.className = 'dozory-safe-quantity';
    quantity.setAttribute('aria-label', 'Количество предметов «' + groupName + '»');
    quantity.min = '1';
    quantity.max = String(Math.max(maximum, 1));
    quantity.value = '1';
    quantity.setAttribute('data-unavailable', unavailable ? 'true' : 'false');
    quantity.disabled = unavailable || transferInProgress;
    quantity.title = unavailable
      ? 'В инвентаре нет свободных мест'
      : 'Количество для переноса (максимум ' + maximum + ')';
    quantity.addEventListener('change', function () {
      var value = parseInt(quantity.value, 10);
      if (!isFinite(value)) {
        value = 1;
      }
      quantity.value = String(Math.max(1, Math.min(value, maximum)));
    });
    quantity.addEventListener('keydown', function (event) {
      if ((event.key === 'Enter' || event.keyCode === 13) && !moveButton.disabled) {
        event.preventDefault();
        moveButton.click();
      }
    });

    maxButton.type = 'button';
    maxButton.className = 'dozory-safe-max';
    maxButton.textContent = 'max';
    maxButton.title = unavailable ? 'В инвентаре нет свободных мест' : 'Выбрать максимум: ' + maximum;
    maxButton.setAttribute('data-unavailable', unavailable ? 'true' : 'false');
    maxButton.disabled = unavailable || transferInProgress;
    maxButton.addEventListener('click', function () {
      quantity.value = String(maximum);
      quantity.focus();
    });

    expandCell.className = 'dozory-safe-expand-cell';
    expandCell.appendChild(expandButton);
    moveCell.className = 'dozory-safe-move-cell';
    moveCell.appendChild(moveButton);
    nameCell.className = 'dozory-safe-name-cell';
    nameCell.appendChild(name);
    countCell.className = 'dozory-safe-count';
    countCell.textContent = '\u00d7' + group.entries.length;
    countCell.title = 'Всего в сейфе: ' + group.entries.length;
    quantityCell.className = 'dozory-safe-quantity-cell';
    quantityCell.appendChild(quantity);
    maxCell.className = 'dozory-safe-max-cell';
    maxCell.appendChild(maxButton);
    iconCell.className = 'dozory-safe-icon';
    iconCell.appendChild(itemIcon);

    row.appendChild(expandCell);
    row.appendChild(moveCell);
    row.appendChild(nameCell);
    row.appendChild(countCell);
    row.appendChild(quantityCell);
    row.appendChild(maxCell);
    row.appendChild(iconCell);

    detailsRow.className = 'dozory-safe-details-row';
    detailsRow.setAttribute('data-group-key', group.key);
    detailsCell.colSpan = 7;
    details.className = 'dozory-safe-details';
    group.entries.forEach(function (entry) {
      details.appendChild(createInstanceRow(entry, availableSlots));
    });
    detailsCell.appendChild(details);
    detailsRow.appendChild(detailsCell);

    return {
      groupRow: row,
      detailsRow: detailsRow
    };
  }

  function applySearchFilter(container) {
    var query = uiState.query.replace(/^\s+|\s+$/g, '').toLowerCase();
    var rows = container.querySelectorAll('.dozory-safe-group');
    var visibleCount = 0;

    Array.prototype.forEach.call(rows, function (row) {
      var key = row.getAttribute('data-group-key');
      var matches = !query || row.getAttribute('data-search-text').indexOf(query) >= 0;
      var detailsRow = row.nextElementSibling;

      row.style.display = matches ? '' : 'none';
      if (detailsRow) {
        detailsRow.style.display = matches && uiState.expandedGroups[key] ? '' : 'none';
      }
      if (matches) {
        visibleCount++;
      }
    });

    var summary = container.querySelector('.dozory-safe-summary');
    if (summary) {
      summary.textContent = visibleCount + '/' + rows.length;
    }
  }

  function createControls(container) {
    var controls = document.createElement('div');
    var search = document.createElement('input');
    var controlRow = document.createElement('div');
    var sort = document.createElement('select');
    var summary = document.createElement('span');
    var options = [
      { value: 'name', label: 'По названию' },
      { value: 'count', label: 'Сначала многочисленные' },
      { value: 'original', label: 'Порядок игры' }
    ];

    controls.className = 'dozory-safe-controls';

    search.type = 'search';
    search.className = 'dozory-safe-search';
    search.placeholder = 'Поиск в сейфе';
    search.value = uiState.query;
    search.setAttribute('aria-label', 'Поиск предметов в сейфе');
    search.addEventListener('input', function () {
      uiState.query = search.value;
      applySearchFilter(container);
    });

    sort.className = 'dozory-safe-sort';
    sort.setAttribute('aria-label', 'Сортировка групп сейфа');
    options.forEach(function (optionData) {
      var option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      option.selected = optionData.value === uiState.sort;
      sort.appendChild(option);
    });
    sort.addEventListener('change', function () {
      uiState.sort = sort.value;
      renderGroupedHomeInventory();
    });

    summary.className = 'dozory-safe-summary';

    controlRow.className = 'dozory-safe-control-row';
    controlRow.appendChild(sort);
    controlRow.appendChild(summary);
    controls.appendChild(search);
    controls.appendChild(controlRow);
    return controls;
  }

  function expandGameFrame() {
    var main = document.getElementById('main');
    var homeSurface = main && main.parentElement;
    var homeInnerCell = homeSurface && homeSurface.parentElement;
    var homeInnerTable = homeInnerCell && homeInnerCell.closest('table');
    var homeOuterCell = homeInnerTable && homeInnerTable.parentElement;
    var homeLayoutRow = homeOuterCell && homeOuterCell.parentElement;
    var homeLayoutTable = homeLayoutRow && homeLayoutRow.closest('table');
    var safeContainer = document.querySelector(HOME_INVENTORY_SELECTOR);
    var safePanel = safeContainer && safeContainer.closest('table');
    var expandedMainWidth = MAIN_BASE_WIDTH + FRAME_GROWTH;
    var expandedHomeWidth = HOME_BASE_WIDTH + FRAME_GROWTH;

    if (!main || !homeSurface || !homeInnerCell || !homeInnerTable || !homeOuterCell || !homeLayoutTable) {
      return;
    }

    // Правая колонка с меню остаётся штатной. Сейф прижимается к ней
    // правым краем и при увеличении ширины расширяется влево.
    main.style.left = 'auto';
    main.style.right = MAIN_RIGHT_GAP + 'px';
    main.style.minWidth = expandedMainWidth + 'px';
    main.style.maxWidth = expandedMainWidth + MAX_SAFE_WIDTH - MIN_SAFE_WIDTH + 'px';
    homeSurface.style.width = '100%';
    homeSurface.style.minWidth = expandedHomeWidth + 'px';
    homeSurface.style.maxWidth = '';
    homeSurface.style.backgroundColor = '#bfbab0';
    homeInnerCell.style.width = '100%';
    homeInnerCell.style.minWidth = expandedHomeWidth + 'px';
    homeInnerTable.style.width = '100%';
    homeInnerTable.style.minWidth = expandedHomeWidth + 'px';
    homeOuterCell.style.width = 'auto';
    homeOuterCell.style.minWidth = expandedHomeWidth + 'px';
    homeLayoutTable.style.width = '100%';
    homeLayoutTable.style.minWidth = expandedHomeWidth + RIGHT_PANEL_WIDTH + 'px';
    homeLayoutTable.style.tableLayout = 'auto';

    if (safePanel) {
      safePanel.className += ' dozory-safe-panel-expanded';
    }
  }

  function getSafeWidth() {
    var main = document.getElementById('main');
    var homeSurface = main && main.parentElement;
    var homeInnerCell = homeSurface && homeSurface.parentElement;
    var minimumMainWidth = MAIN_BASE_WIDTH + FRAME_GROWTH;
    var maximumMainWidth = minimumMainWidth + MAX_SAFE_WIDTH - MIN_SAFE_WIDTH;
    var availableMainWidth = homeInnerCell
      ? Math.round(homeInnerCell.getBoundingClientRect().width) - MAIN_RESERVED_WIDTH
      : minimumMainWidth;
    var currentMainWidth = Math.max(minimumMainWidth, Math.min(maximumMainWidth, availableMainWidth));

    if (main) {
      main.style.width = currentMainWidth + 'px';
    }

    return MIN_SAFE_WIDTH + Math.max(0, currentMainWidth - minimumMainWidth);
  }

  function resizeSafeInventory() {
    var container = document.querySelector(HOME_INVENTORY_SELECTOR);
    if (container) {
      container.style.width = getSafeWidth() + 'px';
    }
  }

  function renderGroupedHomeInventory() {
    var container = document.querySelector(HOME_INVENTORY_SELECTOR);
    if (!container || !window.home_inventory) {
      return;
    }

    var groups = sortGroups(groupHomeInventory());
    var availableSlots = window.person_inventory_capacity - window.person_inventory.items_cnt;

    resizeSafeInventory();

    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    if (groups.length === 0) {
      container.textContent = 'Сейф сейчас пуст';
      return;
    }

    var table = document.createElement('table');
    var body = document.createElement('tbody');
    table.className = 'dozory-safe-groups';

    groups.forEach(function (group) {
      var rows = createGroupRows(group, availableSlots);
      body.appendChild(rows.groupRow);
      body.appendChild(rows.detailsRow);
    });

    table.appendChild(body);
    container.appendChild(createControls(container));
    container.appendChild(table);
    bindInstanceTooltips(groups);
    applySearchFilter(container);
  }

  function addStyles() {
    var style = document.createElement('style');
    style.textContent = [
      HOME_INVENTORY_SELECTOR + ' { overflow-x: hidden !important; box-sizing: border-box; }',
      '.dozory-safe-panel-expanded { box-sizing: border-box; background-color: #bfbab0; border-right: 1px solid #686259; border-bottom: 1px solid #686259; box-shadow: inset -2px 0 #d7d3ca; }',
      '.dozory-safe-controls { width: 100%; box-sizing: border-box; padding: 5px 4px; border-bottom: 1px solid #b8b1a4; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-search { width: 100%; height: 22px; box-sizing: border-box; padding: 2px 4px; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-control-row { height: 22px; margin-top: 4px; line-height: 22px; }',
      '.dozory-safe-sort { width: calc(100% - 46px); height: 22px; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-summary { float: right; width: 42px; color: #5f584c; text-align: right; font-weight: bold; }',
      '.dozory-safe-groups { width: 100%; border-collapse: collapse; table-layout: fixed; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-group { height: 34px; border-bottom: 1px solid #c8c3b7; }',
      '.dozory-safe-group:hover { background: rgba(255, 255, 255, 0.25); }',
      '.dozory-safe-group td { padding: 1px 2px; vertical-align: middle; }',
      '.dozory-safe-expand-cell { width: 14px; padding: 0 !important; text-align: center; }',
      '.dozory-safe-expand { width: 14px; height: 28px; margin: 0; padding: 0; border: 0; background: transparent; color: #554d42; cursor: pointer; font-size: 12px; }',
      '.dozory-safe-move-cell { width: 25px; padding: 0 !important; text-align: center; }',
      '.dozory-safe-name-cell { width: auto; }',
      '.dozory-safe-name { display: block; width: 100%; overflow: hidden; padding: 0; border: 0; background: transparent; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; text-align: left; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-count { width: 23px; padding: 0 !important; color: #5f584c; text-align: center; font-weight: bold; }',
      '.dozory-safe-quantity-cell { width: 36px; padding: 0 !important; text-align: center; }',
      '.dozory-safe-quantity { width: 34px; height: 20px; box-sizing: border-box; padding: 1px; font: 8pt Arial, sans-serif; }',
      '.dozory-safe-max-cell { width: 30px; padding: 0 !important; text-align: center; }',
      '.dozory-safe-max { width: 28px; height: 20px; padding: 0; border: 1px solid #aaa397; border-radius: 2px; background: #eeeae1; color: #544d43; cursor: pointer; font: bold 7pt Arial, sans-serif; }',
      '.dozory-safe-icon { width: 27px; padding: 0 !important; text-align: right; }',
      '.dozory-safe-icon img { max-width: 27px; max-height: 27px; }',
      '.dozory-safe-move { width: 25px; height: 29px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }',
      '.dozory-safe-move img { width: 23px; height: 27px; }',
      '.dozory-safe-details-row > td { padding: 0 !important; }',
      '.dozory-safe-details { padding: 2px 4px 4px 17px; background: rgba(40, 35, 28, 0.07); border-bottom: 1px solid #a9a294; }',
      '.dozory-safe-instance { position: relative; min-height: 27px; padding: 1px 25px 1px 24px; border-top: 1px dotted #bbb3a6; box-sizing: border-box; }',
      '.dozory-safe-instance:first-child { border-top: 0; }',
      '.dozory-safe-instance-name { display: block; width: 100%; height: 25px; overflow: hidden; padding: 0 2px; border: 0; background: transparent; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; text-align: left; font: 7.5pt Arial, sans-serif; }',
      '.dozory-safe-item-move, .dozory-safe-delete { position: absolute; top: 1px; width: 23px; height: 25px; margin: 0; padding: 0; border: 0; background: transparent; cursor: pointer; }',
      '.dozory-safe-item-move { left: 0; }',
      '.dozory-safe-delete { right: 0; }',
      '.dozory-safe-item-move img { width: 18px; height: 22px; }',
      '.dozory-safe-delete img { width: 21px; height: 21px; }',
      '.dozory-safe-move:disabled, .dozory-safe-max:disabled, .dozory-safe-item-move:disabled, .dozory-safe-delete:disabled { cursor: default; opacity: 0.35; }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function install() {
    if (
      typeof window.write_home_inventory !== 'function' ||
      typeof window.write_person_inventory !== 'function' ||
      !window.home_inventory ||
      !window.person_inventory ||
      !window.jQuery ||
      !document.querySelector(HOME_INVENTORY_SELECTOR)
    ) {
      return false;
    }

    originalWriteHomeInventory = window.write_home_inventory;
    window.write_home_inventory = function () {
      originalWriteHomeInventory.apply(window, arguments);
      renderGroupedHomeInventory();
    };

    addStyles();
    expandGameFrame();
    renderGroupedHomeInventory();
    window.addEventListener('resize', resizeSafeInventory);
    return true;
  }

  if (!install()) {
    var attempts = 0;
    var installTimer = window.setInterval(function () {
      attempts++;
      if (install() || attempts >= 50) {
        window.clearInterval(installTimer);
      }
    }, 200);
  }
})();
