'use strict';
/* Официальные курсы центральных банков: ЕЦБ, ЦБ РФ, НБП (Польша), ЧНБ (Чехия) */
(function(){
  var BOX = document.getElementById('banks');
  if(!BOX) return;

  function flag(iso2){
    if(!iso2) return '';
    var pts = [];
    var up = iso2.toUpperCase();
    for(var i = 0; i < up.length; i++){ pts.push(0x1F1E6 + up.charCodeAt(i) - 65); }
    return String.fromCodePoint.apply(String, pts);
  }

  function fmt(n, d){
    if(n === null || n === undefined || !isFinite(n)) return '—';
    return n.toLocaleString('ru-RU', { maximumFractionDigits: (d === undefined ? 4 : d) });
  }

  function info(code){ return CURRENCIES[code] || ['', '']; }

  function card(title, subtitle, url){
    var d = document.createElement('section');
    d.className = 'bank card';
    d.innerHTML =
      '<div class="bank-head"><h3>' + title + '</h3>' +
      (url ? '<a href="' + url + '" target="_blank" rel="noopener">официальный сайт \u2197</a>' : '') +
      '</div>' +
      (subtitle ? '<p class="bank-sub">' + subtitle + '</p>' : '') +
      '<div class="bank-body"><span class="loading">Загрузка…</span></div>';
    BOX.appendChild(d);
    return d.querySelector('.bank-body');
  }

  function fill(body, rows){
    if(!rows.length){
      body.innerHTML = '<p class="err">Данные недоступны</p>';
      return;
    }
    var h = '<table class="mini"><tbody>';
    rows.forEach(function(r){
      h += '<tr><td>' + r[0] + '</td><td class="val">' + r[1] + '</td>' +
           '<td class="chg ' + (r[3] || '') + '">' + (r[2] || '') + '</td></tr>';
    });
    body.innerHTML = h + '</tbody></table>';
  }

  function fail(body, e){
    body.innerHTML = '<p class="err">Не удалось загрузить: ' + (e && e.message ? e.message : e) + '</p>';
  }

  function getJson(url){
    return fetch(url).then(function(res){
      if(!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  /* 1. Европейский центральный банк */
  (function(){
    var body = card('Европейский центральный банк (ЕЦБ)',
      'Официальный справочный курс евро. Обновление ~16:00 CET в рабочие дни.',
      'https://www.ecb.europa.eu/');
    var codes = ['USD','GBP','CHF','JPY','PLN','SEK','CZK','TRY','INR','CNY'];
    getJson('https://api.frankfurter.dev/v1/latest?base=EUR')
      .then(function(json){
        var rates = json.rates || {};
        var rows = codes.filter(function(c){ return rates[c]; }).map(function(c){
          return [flag(info(c)[1]) + ' <b>' + c + '</b> — ' + info(c)[0], '1 EUR = ' + fmt(rates[c]) + ' ' + c, '', ''];
        });
        fill(body, rows);
      })
      .catch(function(e){ fail(body, e); });
  })();

  /* 2. Центральный банк Российской Федерации */
  (function(){
    var body = card('Банк России (ЦБ РФ)',
      'Официальные курсы ЦБ РФ к рублю, со сравнением с предыдущим днём.',
      'https://www.cbr.ru/');
    var codes = ['USD','EUR','GBP','CHF','JPY','CNY','KZT','TRY'];
    getJson('https://www.cbr-xml-daily.ru/daily_json.js')
      .then(function(json){
        var val = json.Valute || {};
        var rows = codes.filter(function(c){ return val[c]; }).map(function(c){
          var v = val[c];
          var rate = v.Value / v.Nominal;
          var prev = v.Previous / v.Nominal;
          var diff = rate - prev;
          var chg = '', cls = '';
          if(Math.abs(diff) > 0.0001){
            chg = (diff > 0 ? '\u25B2 +' : '\u25BC ') + fmt(diff);
            cls = diff > 0 ? 'up' : 'down';
          }
          return [flag(info(c)[1]) + ' <b>' + c + '</b> — ' + info(c)[0], fmt(rate) + ' \u20BD', chg, cls];
        });
        fill(body, rows);
      })
      .catch(function(e){ fail(body, e); });
  })();

  /* 3. Национальный банк Польши (NBP) */
  (function(){
    var body = card('Национальный банк Польши (NBP)',
      'Средние курсы (Tabela A) к польскому злотому, один раз в рабочий день.',
      'https://www.nbp.pl/');
    var codes = ['USD','EUR','GBP','CHF','JPY','CNY','NOK','TRY'];
    getJson('https://api.nbp.pl/api/exchangerates/tables/A?format=json')
      .then(function(data){
        var rates = {};
        (data[0].rates || []).forEach(function(r){ rates[r.code] = r; });
        var rows = codes.filter(function(c){ return rates[c]; }).map(function(c){
          var r = rates[c];
          var denom = r.amount || 1;
          var val = r.mid / denom;
          return [flag(info(c)[1]) + ' <b>' + c + '</b> — ' + info(c)[0], '1 ' + c + ' = ' + fmt(val) + ' PLN', '', ''];
        });
        fill(body, rows);
      })
      .catch(function(e){ fail(body, e); });
  })();

  /* 4. Чешский национальный банк (CNB) */
  (function(){
    var body = card('Чешский национальный банк (CNB)',
      'Официальный курс к чешской кроне, устанавливается в каждый рабочий день.',
      'https://www.cnb.cz/');
    var wanted = { USD:1, EUR:1, GBP:1, PLN:1, JPY:1, HUF:1, TRY:1, KRW:1 };
    fetch('https://api.cnb.cz/cnbapi/exchangerates/daily-en.txt')
      .then(function(res){
        if(!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function(text){
        var rows = [];
        text.split('\n').forEach(function(line){
          var p = line.trim().split('|');
          if(p.length >= 5 && /^[A-Z]{3}$/.test(p[3]) && wanted[p[3]]){
            var amount = parseFloat(p[2]);
            var rate = parseFloat(p[4]);
            if(isFinite(amount) && isFinite(rate)){
              rows.push([flag(info(p[3])[1]) + ' <b>' + p[3] + '</b> — ' + info(p[3])[0],
                '1 ' + p[3] + ' = ' + fmt(rate / amount) + ' CZK', '', '']);
            }
          }
        });
        fill(body, rows);
      })
      .catch(function(e){ fail(body, e); });
  })();
})();
