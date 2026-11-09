// Pure, browser-compatible domain logic. No filesystem, network, or ambient clock.
export const UNIFORMS = Object.freeze({
  gym:'Gym uniform', class:'Class uniform', first_dress:'First Dress',
  civvies:'Civvies', none:'No school', unknown:'Check class notice'
});
export function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Expected YYYY-MM-DD, received: ${value}`);
  const dt = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(+dt) || dt.toISOString().slice(0,10)!==value) throw new Error(`Invalid date: ${value}`);
  return dt;
}
export function addDays(value, amount) {
  const dt = parseDate(value); dt.setUTCDate(dt.getUTCDate()+amount);
  return dt.toISOString().slice(0,10);
}
export const weekday = value => parseDate(value).getUTCDay();
export function dateRange(start,end) {
  parseDate(start); parseDate(end);
  if (end < start) throw new Error('End date must be on or after start date');
  const result=[];
  for (let d=start; d<=end; d=addDays(d,1)) result.push(d);
  return result;
}
export function localToday(now=new Date(), timezone='America/Toronto') {
  const parts = new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part = type => parts.find(p=>p.type===type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function weekDates(date) {
  const offset=(weekday(date)+6)%7;
  const monday=addDays(date,-offset);
  return dateRange(monday,addDays(monday,4));
}
export function matchesScope(scope={},cls) {
  return (!scope.classes || scope.classes.includes(cls.id)) &&
    (!scope.grades || scope.grades.includes(cls.grade)) &&
    (!scope.divisions || scope.divisions.includes(cls.division));
}
const inRange = (row,date) => row.date ? row.date===date : row.start<=date && date<=row.end;
const globalScope = scope => !scope || Object.keys(scope).length===0;
const specificity = scope => scope?.classes ? 3 : scope?.grades ? 2 : scope?.divisions ? 1 : 0;

// Independently derive the academic sequence, then reconcile against printed labels.
export function academicCalendar(year) {
  const result=new Map(); let cursor=year.cycle.start_day;
  for (const date of dateRange(year.cycle.start_date,year.coverage.end)) {
    if ([0,6].includes(weekday(date)) || year.closures.some(c=>globalScope(c.scope)&&inRange(c,date))) continue;
    const special=year.special_days.find(d=>d.date===date);
    result.set(date,special ? {...special} : {date,school_day:cursor,kind:'regular',source:'calendar'});
    if (!special || special.advances_cycle) cursor=cursor%year.cycle.length+1;
  }
  return result;
}

export function validateYear(year) {
  const errors=[];
  try {
    if (year.schema_version!==1) throw new Error('Unsupported schema_version');
    if (!year.school_id || !year.school_year) throw new Error('Missing school/year identity');
    dateRange(year.coverage.start,year.coverage.end);
    if (!Number.isInteger(year.revision)||year.revision<1) throw new Error('Revision must be a positive integer');
    if (!Number.isFinite(Date.parse(year.updated_at))) throw new Error('Invalid updated_at');
    new Intl.DateTimeFormat('en-CA',{timeZone:year.timezone});
    if (!Number.isInteger(year.cycle.length)||year.cycle.length<1 || !Number.isInteger(year.cycle.start_day) || year.cycle.start_day<1 || year.cycle.start_day>year.cycle.length) throw new Error('Invalid cycle');
    parseDate(year.cycle.start_date);
    if (year.cycle.start_date<year.coverage.start || year.cycle.start_date>year.coverage.end) throw new Error('Cycle anchor outside coverage');
    const classIds=new Set();
    const checkSource=row=>{if (!year.sources[row.source]) errors.push(`Unknown source: ${row.source}`);};
    const checkRow=row=>{
      if (row.date) parseDate(row.date); else dateRange(row.start,row.end);
      checkSource(row);
      for (const id of row.scope?.classes||[]) if (!year.classes.some(c=>c.id===id)) errors.push(`Scope references unknown class ${id}`);
    };
    for (const cls of year.classes) {
      if (classIds.has(cls.id)) errors.push(`Duplicate class ${cls.id}`); classIds.add(cls.id);
      if (!year.policies[cls.policy] || !matchesScope(year.policies[cls.policy].scope,cls)) errors.push(`Invalid policy for ${cls.id}`);
      if (cls.rotation) {
        checkSource(cls.rotation);
        if (!['published','parent_confirmed','inferred'].includes(cls.rotation.evidence)) errors.push(`Invalid rotation evidence for ${cls.id}`);
        if (new Set(cls.rotation.gym_days).size!==cls.rotation.gym_days.length || cls.rotation.gym_days.some(d=>!Number.isInteger(d)||d<1||d>year.cycle.length)) errors.push(`Invalid gym days for ${cls.id}`);
      }
      const seen=new Set();
      for (const obs of cls.observations) {
        checkRow(obs);
        if (seen.has(obs.date)) errors.push(`Duplicate observation for ${cls.id}: ${obs.date}`);
        seen.add(obs.date);
        if (typeof obs.pe!=='boolean') errors.push(`Invalid PE observation for ${cls.id}`);
      }
    }
    for (const rows of [year.closures,year.special_days,year.orientations,year.uniform_overrides,year.properties]) for (const row of rows) checkRow(row);
    for (const rule of year.uniform_overrides) if (!['gym','class','first_dress','civvies'].includes(rule.uniform)) errors.push(`Invalid uniform override ${rule.id}`);
    const specialDates=year.special_days.map(r=>r.date);
    if (new Set(specialDates).size!==specialDates.length) errors.push('Duplicate special date');
    const generated=academicCalendar(year), published=new Map();
    for (const row of year.published_days) {
      parseDate(row.date); checkSource(row);
      if (published.has(row.date)) errors.push(`Duplicate published date ${row.date}`);
      published.set(row.date,row);
    }
    for (const [date,row] of generated) if (published.get(date)?.school_day!==row.school_day) errors.push(`${date}: calculated Day ${row.school_day}, published ${published.get(date)?.school_day ?? 'missing'}`);
    for (const date of published.keys()) if (!generated.has(date)) errors.push(`${date}: printed label has no generated school day`);
    for (const policy of Object.values(year.policies)) {
      checkSource(policy);
      if (policy.first_dress_weekdays.some(n=>!Number.isInteger(n)||n<0||n>6)) errors.push('Invalid First Dress weekday');
      const seen=new Set();
      for (const season of policy.seasons) {
        checkRow(season);
        for (const date of dateRange(season.start,season.end)) {
          if (seen.has(date)) errors.push(`Overlapping seasons on ${date}`);
          seen.add(date);
        }
      }
    }
    return {valid:!errors.length,errors,printed_days:published.size,calculated_days:generated.size,
      regular_days:[...generated.values()].filter(d=>d.kind==='regular').length,
      flex_days:[...generated.values()].filter(d=>d.kind==='flex').length};
  } catch (error) { return {valid:false,errors:[...errors,error.message]}; }
}

export function createEngine(year) {
  const validation=validateYear(year);
  if (!validation.valid) throw new Error(`Invalid school-year data: ${validation.errors.join('; ')}`);
  const academic=academicCalendar(year), printed=new Map(year.published_days.map(d=>[d.date,d]));
  function query(date,classId,{includeInferred=true}={}) {
    parseDate(date);
    const cls=year.classes.find(c=>c.id===classId);
    if (!cls) throw new Error(`Unknown class ${classId}; choose ${year.classes.map(c=>c.id).join(', ')}`);
    const sources = ids => [...new Set(ids.filter(Boolean))].map(id=>({id,...year.sources[id]}));
    const day=academic.get(date), policy=year.policies[cls.policy];
    const covered=date>=year.coverage.start && date<=year.coverage.end;
    const properties=year.properties.filter(p=>inRange(p,date)&&matchesScope(p.scope,cls));
    const season=policy.seasons.find(s=>inRange(s,date))||null;
    const warnings=[];
    const base={date,class_id:classId,grade:cls.grade,division:cls.division,school_year:year.school_year,
      school_day:day?.school_day??null,day_kind:day?.kind??null,in_session:false,covered,
      season:season?{...season}:null,properties,warnings,calendar_evidence:printed.get(date)||null,
      pe:null,uniform:null,sources:[]};
    const finish=(kind,status,reason,ids=[],needsConfirmation=false)=>{
      base.uniform={kind,label:UNIFORMS[kind],status,reason,needs_confirmation:needsConfirmation};
      base.sources=sources(['calendar',...properties.map(p=>p.source),...ids]);
      return base;
    };
    if (!covered) {
      base.day_kind='outside_coverage';base.school_day=null;
      return finish('unknown','unknown','No published calendar loaded for this date',[],true);
    }
    const closure=year.closures.find(c=>inRange(c,date)&&matchesScope(c.scope,cls));
    if (closure) {base.day_kind='closure';base.school_day=null; return finish('none','published',closure.reason,[closure.source]);}
    if ([0,6].includes(weekday(date))) {base.day_kind='weekend'; return finish('none','published','Weekend');}
    const orientation=year.orientations.find(o=>o.date===date&&matchesScope(o.scope,cls));
    if (!day&&!orientation) {base.day_kind='no_classes';return finish('none','published','No regular classes scheduled');}
    base.in_session=true;
    if (orientation) base.day_kind='orientation';
    const observation=cls.observations.find(o=>o.date===date);
    if (observation) base.pe={scheduled:observation.pe,status:observation.evidence,source:observation.source};
    else if (day?.kind==='regular'&&cls.rotation&&(includeInferred||cls.rotation.evidence!=='inferred')) {
      base.pe={scheduled:cls.rotation.gym_days.includes(day.school_day),status:cls.rotation.evidence,source:cls.rotation.source};
    }
    const overrides=year.uniform_overrides.filter(o=>inRange(o,date)&&matchesScope(o.scope,cls))
      .sort((a,b)=>(b.priority||0)-(a.priority||0)||specificity(b.scope)-specificity(a.scope));
    if (overrides.length) {
      const top=overrides[0];
      const peers=overrides.filter(o=>(o.priority||0)===(top.priority||0)&&specificity(o.scope)===specificity(top.scope));
      if (new Set(peers.map(p=>p.uniform)).size>1) return finish('unknown','unknown','Conflicting clothing notices need review',peers.map(p=>p.source),true);
      return finish(top.uniform,top.evidence,top.reason,[top.source]);
    }
    if (day?.kind==='flex') warnings.push('Day 9 activity and kit instructions have not been confirmed. Check the class notice.');
    if (orientation) return finish('first_dress','published','Orientation day',[policy.source]);
    if (day?.kind==='flex') return finish('unknown','unknown','Day 9 instructions needed',[],true);
    if (!base.pe) return finish('unknown','unknown',cls.rotation?'Inferred rotation is switched off':'Class PE timetable not yet confirmed',[],true);
    if (base.pe.scheduled) return finish('gym',base.pe.status,'PE day — gym uniform worn all day',[base.pe.source,policy.source]);
    if (policy.first_dress_weekdays.includes(weekday(date))) {
      return finish('first_dress',base.pe.status,'First Dress day without scheduled PE',[policy.first_dress_source || policy.source,base.pe.source]);
    }
    if (season?.kind==='transition') warnings.push(season.note);
    return finish('class',base.pe.status,'No PE scheduled for this class',[base.pe.source,policy.source,season?.source],!season||season.evidence==='unknown');
  }
  return {year,validation,query,range:(start,end,classId,options)=>dateRange(start,end).map(d=>query(d,classId,options))};
}
