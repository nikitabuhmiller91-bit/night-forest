'use strict';
/* Основная логика: курсы, таблица, конвертер, карта */
(function(){
  var state = { base:'USD', rates:null, update:'', source:'' };

  var BASES = ['USD','EUR','RUB','GBP','JPY','CNY','CHF','KZT','UAH','TRY','INR','BRL','CAD','AUD','PLN','KRW','SGD','AED','SEK','ILS'];

  function el(id){ return document.getElementById(id); }

  function fmt(n){
    if(n === null || n === undefined || !isFinite(n)) return '—';
    var d;
    if(Math.abs(n) >= 1000) d = 2;
    else if(Math.abs(n) >= 1) d = 4;
    else d = 6;
    return n.toLocaleString('ru-RU', { maximumFractionDigits: d });
  }

  function flag(iso2){
    if(!iso2) return '\u2691';
    var pts = [];
    var up = iso2.toUpperCase();
    for(var i = 0; i < up.length; i++){
      pts.push(0x1F1E6 + up.charCodeAt(i) - 65);
    }
    return String.fromCodePoint.apply(String, pts);
  }

  function currInfo(code){ return CURRENCIES[code] || ['','']; }

  function setStatus(t){ el('status').textContent = t; }

  function initControls(){
    var bs = el('base-select');
    bs.innerHTML = BASES.map(function(c){
      return '<option value="' + c + '">' + flag(currInfo(c)[1]) + ' ' + c + '</option>';
    }).join('');
    bs.value = state.base;
    bs.addEventListener('change', function(){ loadRates(bs.value); });

    var codes = Object.keys(CURRENCIES).sort();
    var optHtml = codes.map(function(c){
      return '<option value="' + c + '">' + flag(currInfo(c)[1]) + ' ' + c + '</option>';
    }).join('');
    el('c-from').innerHTML = optHtml;
    el('c-to').innerHTML = optHtml;
    el('c-from').value = 'USD';
    el('c-to').value = 'RUB';
    el('c-from').addEventListener('change', updateConvert);
    el('c-to').addEventListener('change', updateConvert);
    el('c-amount').addEventListener('input', updateConvert);
    el('swap').addEventListener('click', function(){
      var f = el('c-from').value;
      el('c-from').value = el('c-to').value;
      el('c-to').value = f;
      updateConvert();
    });

    el('search').addEventListener('input', renderTable);
    el('sort').addEventListener('change', renderTable);
  }

  function loadRates(base){
    setStatus('Загрузка курсов (' + base + ')…');
    fetch('https://open.er-api.com/v6/latest/' + base)
      .then(function(res){
        if(!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(json){
        if(!json || !json.rates || !json.rates.RUB) throw new Error('нет данных');
        state.base = base;
        state.rates = json.rates;
        state.update = json.time_last_update_utc || '';
        state.source = 'open.er-api.com (160+ валют)';
        render();
      })
      .catch(function(){
        return fetch('https://api.frankfurter.dev/v1/latest?base=' + base)
          .then(function(res){
            if(!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
          })
          .then(function(json){
            var rates = json.rates || {};
            rates[json.base || base] = 1;
            state.base = base;
            state.rates = rates;
            state.update = 'курсы ЕЦБ от ' + (json.date || '');
            state.source = 'Европейский центральный банк (~30 валют)';
            render();
          });
      })
      .catch(function(){
        setStatus('\u26A0 Не удалось загрузить курсы. Проверь подключение к интернету и обнови страницу.');
      });
  }

  function rowsFor(){
    var q = el('search').value.trim().toLowerCase();
    var mode = el('sort').value;
    var codes = Object.keys(state.rates).filter(function(c){ return c !== state.base; });
    codes = codes.filter(function(c){
      if(!q) return true;
      var info = currInfo(c);
      return c.toLowerCase().indexOf(q) !== -1 || info[0].toLowerCase().indexOf(q) !== -1;
    });
    if(mode === 'code'){
      codes.sort();
    } else if(mode === 'name'){
      codes.sort(function(a,b){ return currInfo(a)[0].localeCompare(currInfo(b)[0], 'ru'); });
    } else if(mode === 'rate-asc'){
      codes.sort(function(a,b){ return state.rates[a] - state.rates[b]; });
    } else if(mode === 'rate-desc'){
      codes.sort(function(a,b){ return state.rates[b] - state.rates[a]; });
    }
    return codes;
  }

  function rowHtml(code){
    var info = currInfo(code);
    var rate = state.rates[code];
    return '<tr>' +
      '<td class="flag">' + flag(info[1]) + '</td>' +
      '<td><b>' + code + '</b></td>' +
      '<td>' + (info[0] || '<span class="muted">—</span>') + '</td>' +
      '<td class="num">' + fmt(rate) + '</td>' +
      '<td class="num muted">' + fmt(1 / rate) + '</td>' +
    '</tr>';
  }

  function renderTable(){
    var body = el('rates-body');
    if(!state.rates){
      body.innerHTML = '<tr><td colspan="5" class="empty">Загрузка…</td></tr>';
      return;
    }
    var rows = rowsFor();
    el('count').textContent = rows.length;
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="5" class="empty">Ничего не найдено</td></tr>';
      return;
    }
    body.innerHTML = rows.map(rowHtml).join('');
  }

  function updateConvert(){
    if(!state.rates) return;
    var raw = parseFloat(el('c-amount').value);
    var amount = (isFinite(raw) && raw > 0) ? raw : 1;
    var from = el('c-from').value;
    var to = el('c-to').value;
    var rf = state.rates[from];
    var rt = state.rates[to];
    if(!rf || !rt){
      el('c-result').textContent = 'Нет курса для "' + (rf ? to : from) + '" у выбранного источника.';
      return;
    }
    var result = amount * rt / rf;
    el('c-result').innerHTML = '<b>' + fmt(amount) + '</b> ' + from +
      ' = <b>' + fmt(result) + '</b> ' + to;
  }

  var map = null, geoLayer = null, infoDiv = null, legendDiv = null;
  var THRESH = [0.5, 1, 2, 10, 100];
  var COLORS = ['#2f5fd0','#5b9bd5','#4fae84','#f0c04a','#ef8845','#d1495b'];
  var NO_DATA = '#39414d';

  function colorFor(v){
    if(v === null || v === undefined || !isFinite(v)) return NO_DATA;
    for(var i = 0; i < THRESH.length; i++){
      if(v < THRESH[i]) return COLORS[i];
    }
    return COLORS[THRESH.length];
  }

  function legendHtml(){
    var labels = ['менее 0,5','0,5 – 1','1 – 2','2 – 10','10 – 100','100 и более'];
    var h = '<div class="legend-title">Местной валюты за 1 ' + state.base + '</div>';
    for(var i = 0; i < COLORS.length; i++){
      h += '<div><i style="background:' + COLORS[i] + '"></i>' + labels[i] + '</div>';
    }
    h += '<div><i style="background:' + NO_DATA + '"></i>нет данных</div>';
    return h;
  }

  function initMap(){
    if(typeof L === 'undefined') return;
    map = L.map('map', { center: [24, 12], zoom: 2, attributionControl: false });

    var info = L.control();
    info.onAdd = function(){
      infoDiv = L.DomUtil.create('div', 'map-info');
      infoDiv.innerHTML = 'Наведи курсор на страну.';
      return infoDiv;
    };
    info.addTo(map);

    var legend = L.control({ position: 'bottomleft' });
    legend.onAdd = function(){
      legendDiv = L.DomUtil.create('div', 'legend');
      legendDiv.innerHTML = legendHtml();
      return legendDiv;
    };
    legend.addTo(map);

    fetch('https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json')
      .then(function(res){ return res.json(); })
      .then(function(gj){
        geoLayer = L.geoJSON(gj, {
          style: styleFn,
          onEachFeature: onEachFeature
        }).addTo(map);
      })
      .catch(function(){
        el('map').innerHTML = '<div class="map-info">Не удалось загрузить границы стран.</div>';
      });
  }

  function rateForIso(iso3){
    if(!iso3 || !state.rates) return null;
    var code = ISO3_TO_CODE[String(iso3).toUpperCase()];
    if(!code) return null;
    var r = state.rates[code];
    return r ? { code: code, r: r } : null;
  }

  function infoHtml(feature){
    var item = rateForIso(feature.id);
    var name = (feature.properties && feature.properties.name) || feature.id || '';
    var h = '<b>' + name + '</b><br>';
    if(item){
      var info = currInfo(item.code);
      h += flag(info[1]) + ' <b>' + item.code + '</b> — ' + info[0] + '<br>' +
        '1 ' + state.base + ' = <b>' + fmt(item.r) + '</b> ' + item.code + '<br>' +
        '1 ' + item.code + ' = ' + fmt(1 / item.r) + ' ' + state.base;
    } else {
      h += '<span class="muted">нет данных по этой стране</span>';
    }
    return h;
  }

  function onEachFeature(feature, layer){
    layer.on({
      mouseover: function(){
        layer.setStyle({ weight: 2.5, color: '#ffffff', fillOpacity: 0.92 });
        if(infoDiv) infoDiv.innerHTML = infoHtml(feature);
      },
      mouseout: function(){
        if(geoLayer) geoLayer.resetStyle(layer);
        if(infoDiv) infoDiv.innerHTML = 'Наведи курсор на страну.';
      },
      click: function(){
        if(infoDiv) infoDiv.innerHTML = infoHtml(feature);
      }
    });
  }

  function updateMap(){
    el('map-base').textContent = state.base;
    if(!geoLayer) return;
    geoLayer.setStyle(styleFn);
    if(legendDiv) legendDiv.innerHTML = legendHtml();
  }

  function render(){
    if(state.update){
      setStatus('\u2713 Обновлено: ' + state.update + ' • источник: ' + state.source);
    }
    el('base-badge').textContent = 'за 1 ' + state.base;
    el('base-col').textContent = '1 ' + state.base + ' =';
    el('unit-col').textContent = '1 единица =';
    renderTable();
    updateConvert();
    updateMap();
  }

  initControls();
  loadRates(state.base);
  initMap();
})();
