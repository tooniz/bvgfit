import {UNIFORMS,localToday,addDays,weekday,weekDates,dateRange,parseDate} from './engine.mjs';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const icons = {gym:'👟',class:'👔',first_dress:'🤵',civvies:'🦄'};
const dateLabel = (date, options) => new Intl.DateTimeFormat('en-CA', {timeZone:'UTC', ...options}).format(parseDate(date));
const remembered = () => { try { return localStorage.getItem('bvgfit.class'); } catch { return null; } };
const state = {classId:params.get('class') || remembered(), year:params.get('year'), date:params.get('date'), view:params.get('view')};
let catalog, year, schedule, today;
let request = 0;
function query(date) {
  const row = schedule.get(date);
  return row ? {...row,covered:true,uniform:{...row.uniform,label:UNIFORMS[row.uniform.kind]}}
    : {date,covered:false,in_session:false,notes:[],uniform:{kind:'unknown',label:UNIFORMS.unknown}};
}
async function loadClass() {
  const token = ++request;
  $('schedule').replaceChildren();
  schedule = new Map();
  const grade = state.classId.match(/^[A-Z]+\d+/)?.[0];
  if (!grade) throw Error('Invalid class');
  const days = await json(`./data/${year.id}/${grade}/${state.classId}_schedule.json`);
  if (token !== request) return;
  $('error').hidden = true;
  schedule = new Map(days.map(day => [day.date,day]));
  render();
}

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw Error('Calendar unavailable');
  return response.json();
}
function options(select, values, selected) {
  select.replaceChildren(...values.map(value => new Option(value, value, false, value === selected)));
}
function clamp(date) {
  const {start,end} = year;
  return date < start ? start : date > end ? end : date;
}
function todayInYear() { return clamp(today); }
async function loadYear() {
  const entry = catalog.years.find(y => y.id === state.year)
    || catalog.years.find(y => {
      const date = state.date || localToday(new Date(), y.timezone);
      return y.start <= date && date <= y.end;
    }) || catalog.years.at(-1);
  year = entry;
  today = localToday(new Date(), year.timezone);
  state.year = entry.id;
  try { parseDate(state.date); } catch { state.date = todayInYear(); }
  state.date = clamp(state.date);
  const classes = year.classes;
  if (!classes.includes(state.classId)) state.classId = classes[0];
  if (!['week','month'].includes(state.view)) state.view = 'week';
  options($('class-select'), classes, state.classId);
  options($('year'), catalog.years.map(y => y.id), state.year);
  $('year').hidden = catalog.years.length < 2;
  $('date').min = entry.start;
  $('date').max = entry.end;
  await loadClass();
}
function monthStart(date, offset=0) {
  const month = parseDate(date);
  month.setUTCDate(1);
  month.setUTCMonth(month.getUTCMonth()+offset);
  return month.toISOString().slice(0,10);
}
function period() {
  const date = state.date;
  if (state.view === 'month') return [monthStart(date), addDays(monthStart(date,1),-1)];
  const dow = weekday(date);
  const week = weekDates(dow === 0 || dow === 6 ? addDays(date,dow === 0 ? 1 : 2) : date);
  return [week[0],week.at(-1)];
}
function row(day) {
  const item = document.createElement('li');
  item.className = 'kind-' + day.uniform.kind;
  const time = document.createElement('time');
  time.dateTime = day.date;
  time.textContent = dateLabel(day.date,{weekday:'short',month:'short',day:'numeric'});
  if (day.date === today) time.setAttribute('aria-current','date');
  const content = document.createElement('div');
  const outfit = document.createElement('span');
  outfit.className = 'outfit';
  if (icons[day.uniform.kind]) {
    const emoji = document.createElement('span');
    emoji.className = 'emoji';
    emoji.setAttribute('aria-hidden','true');
    emoji.textContent = icons[day.uniform.kind];
    outfit.append(emoji);
  }
  outfit.append(day.uniform.label);
  content.append(outfit);
  const notes = [...day.notes];
  if (day.day_kind === 'flex' && day.uniform.kind !== 'unknown' && day.uniform.needs_confirmation) notes.push('Check class notice');
  for (const note of notes) {
    const line = document.createElement('p');
    line.className = 'note';
    line.textContent = note;
    content.append(line);
  }
  const date = document.createElement('div');
  date.append(time);
  if (day.school_day !== null) {
    const cycle = document.createElement('p');
    cycle.className = 'note';
    cycle.textContent = 'Day ' + day.school_day;
    date.append(cycle);
  }
  item.append(date,content);
  return item;
}
function monthGrid(start,end) {
  const table = document.createElement('table');
  table.className = 'month-grid';
  table.setAttribute('aria-labelledby','period');
  const headings = table.createTHead().insertRow();
  for (const name of ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']) {
    const heading = document.createElement('th');
    heading.scope = 'col';
    heading.textContent = name;
    headings.append(heading);
  }
  const dates = dateRange(addDays(start,-weekday(start)),addDays(end,6-weekday(end)));
  const body = table.createTBody();
  for (let i = 0; i < dates.length; i += 7) {
    const week = body.insertRow();
    for (let j = 0; j < 7; j++) {
      const cell = week.insertCell();
      const date = dates[i + j];
      const day = query(date);
      const weekend = j === 0 || j === 6;
      const show = day.covered && (day.in_session || (day.day_kind === 'closure' && !weekend));
      cell.className = show ? 'kind-' + day.uniform.kind : 'quiet-day';
      if (date < start || date > end) cell.classList.add('outside-month');
      const time = document.createElement('time');
      time.dateTime = date;
      time.textContent = Number(date.slice(8));
      time.setAttribute('aria-label',dateLabel(date,{weekday:'long',month:'long',day:'numeric'}));
      if (date === today) time.setAttribute('aria-current','date');
      cell.append(time);
      if (show) {
        const emoji = document.createElement('span');
        emoji.className = 'month-emoji';
        emoji.setAttribute('role','img');
        emoji.setAttribute('aria-label',day.uniform.label);
        emoji.title = day.uniform.label;
        emoji.textContent = icons[day.uniform.kind] || (day.uniform.kind === 'none' ? '🛑' : '❔');
        cell.append(emoji);
      }
    }
  }
  return table;
}
function render() {
  const [start,end] = period();
  $('view').value = state.view;
  $('date').value = state.date;
  const short = date => dateLabel(date,{month:'short',day:'numeric'});
  $('period').textContent = state.view === 'month'
    ? dateLabel(start,{month:'long',year:'numeric'})
    : short(start) + ' – ' + (start.slice(0,7) === end.slice(0,7) ? Number(end.slice(8)) : short(end));
  if (state.view === 'month') {
    $('schedule').replaceChildren(monthGrid(start,end));
  } else {
    const days = dateRange(start,end).map(date => query(date))
      .filter(day => day.covered && (day.in_session || day.day_kind === 'closure' || day.notes.length));
    const list = document.createElement('ol');
    list.append(...days.map(row));
    $('schedule').replaceChildren(days.length ? list : Object.assign(document.createElement('p'),{textContent:'No school days in this period.'}));
  }
  $('prev').disabled = start <= year.start;
  $('next').disabled = end >= year.end;
  const url = new URL(location.href);
  for (const [key,value] of Object.entries({class:state.classId,year:state.year,date:state.date,view:state.view})) url.searchParams.set(key,value);
  history.replaceState(null,'',url);
}
function move(direction) {
  const [start] = period();
  const next = state.view === 'month' ? monthStart(state.date,direction) : addDays(start,7*direction);
  state.date = clamp(next);
  render();
}
$('class-select').onchange = async event => {
  state.classId = event.target.value;
  try { localStorage.setItem('bvgfit.class',state.classId); } catch {}
  try { await loadClass(); } catch { showError(); }
};
$('year').onchange = async event => {
  state.year = event.target.value;
  state.date = null;
  try { await loadYear(); } catch { showError(); }
};
$('view').onchange = event => { state.view = event.target.value; render(); };
$('date').onchange = event => { if (event.target.value) { state.date = clamp(event.target.value); render(); } };
$('prev').onclick = () => move(-1);
$('next').onclick = () => move(1);
$('today').onclick = () => { state.date = todayInYear(); render(); };
function showError() {
  $('error').textContent = 'Couldn’t load the calendar. Try refreshing.';
  $('error').hidden = false;
}
try {
  catalog = await json('./data/catalog.json');
  await loadYear();
  $('app').hidden = false;
} catch { showError(); }
finally { $('loading').hidden = true; }
