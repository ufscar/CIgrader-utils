const github_user = getSecret('github_user');//professor username
const github_token = getSecret('github_token');//Github token with workflow scope
const user_token = Utilities.base64Encode(github_user+':'+github_token);
const headers = {'Authorization': 'Basic ' + user_token};
const get_params = {method: 'GET', headers: headers};

const prof_repo = 'ufscar-2021-1-PA-listas';
const prof_github = github_user+' '+prof_repo;
// github where ther graders are
let ci_hash;
try { ci_hash = getCIhash('ufscar/CIgrader'); }
catch(e) {}
// sha of .github folder in the student github
// Change it if using another source

const ss = SpreadsheetApp.getActiveSpreadsheet();
const sh = ss.getSheetByName('Grades');

const col_ra = 1;
const col_name = 2;
const col_mail = 3;
const col_class = 4;
const col_git = 5;
const col_invite = 6;
const col_edit_ci = 7;
const col_n_ci_commits = 8;
const data_cols = 8;
const col_grade0 = 12;
const col_suspended = sh.getLastColumn();

let grade_commits_n = 4;

const expected_tasks = 14;

function onOpen() {
    let ui = SpreadsheetApp.getUi();
    ui.createMenu('Update')
        .addItem('All grades', 'updateGrades')
        .addItem('Some gredes', 'updateGrade')
        .addToUi();
    ui.createMenu('Send')
        .addItem('All grades', 'mailGrades')
        .addItem('Some grades', 'mailGrade')
        .addToUi();
}

function checkProfGithub(log, logs_url) {
    let prof_githubs = log.match(/PROFESSOR GITHUB: ([^\n]+)/g) || [];
    if(prof_githubs.length !== 1) {
        Logger.log(logs_url);
        Logger.log('Professor github modified!');
        return false;
    }
    let log_prof_github = prof_githubs[0].replace('PROFESSOR GITHUB: ', '').trim();
    if(log_prof_github !== prof_github) {
        Logger.log(logs_url);
        Logger.log('Professor github modified! '+log_prof_github);
        return false;
    }
    return true;
}

function checkCIcommits(github, n0=0) {
    let commits = [];
    let all = [];
    let url, r, js;
    let p = 1, n_c = 1;
    while(n_c > 0 || p === 1) {
        url = 'https://api.github.com/repos/'+github+'/commits?path=%2Egithub&page='+p.toString()+'&per_page=100';
        r = UrlFetchApp.fetch(url, get_params);
        js = JSON.parse(r.getContentText())
        n_c = js.length;
        commits = js.filter(commit => commit.author.login !== github_user);
        all = all.concat(commits);
        p = p+1;
    }
    if(all.length !== n0) {
        Logger.log('CI files commited by student '+all.length.toString()+' times!');
        Logger.log(all);
        return false;
    }
    return true;
}

function getCIhash(github) {
    let r = UrlFetchApp.fetch('https://api.github.com/repos/'+github+'/contents', get_params);
    return JSON.parse(r.getContentText())
        .filter(f => (f.name === ".github" && f.type === "dir"))
        .map(f => f.sha)[0];
}

function checkCIhash(github) {
    let h = getCIhash(github);
    if(h !== ci_hash) {
        Logger.log('CI files sha unknown!');
        Logger.log('Expected: '+ci_hash);
        Logger.log('Found: '+h);
        return false;
    }
    return true;
}

function getScore(log) {
    let aux;
    log = log.split('\n');
    for(let i=log.length-1; i>=0; i--) {
        aux = log[i].replace(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, '').trim();
        if(aux.match(/^\[{[^\]]+}]$/g)) {
            try { return JSON.parse(aux); }
            catch (e) { Logger.log(aux); }
            return [];
        }
    }
    return [];
}

function getRuns(github) {
    url = 'https://api.github.com/repos/'+github+'/actions/runs?status=success';
    let r = UrlFetchApp.fetch(url, get_params);
    return JSON.parse(r.getContentText())["workflow_runs"];
}

function getGraderLog(url) {
    try {
        r = UrlFetchApp.fetch(url, get_params);
        let zip = r.getBlob();
        let log_file = Utilities.unzip(zip).filter(f => f.getName().includes('Grader'));
        if(log_file.length > 0) {
            log_file = log_file[0];
            return log_file.getDataAsString().trim();
        }
    } catch(e) {}
    return "";
}

function taskColumn(task) {
    task = task.toString().trim();
    for(let col=data_cols; ; col++) {
        let head = sh.getRange(1, col).getValue().toString().trim();
        if(head === task)
            return col;
        if(head.length === 0)
            return null;
    }
}

function colorRow(row, color='#fffbe3') {
    sh.getRange(row.toString()+":"+row.toString()).setBackground(color);
    SpreadsheetApp.flush();
}

function mailOpen(name) {
    const h = (new Date()).getHours();
    if(h < 6 || h > 19)
        return "Boa noite "+name+"!";
    if(h < 12)
        return "Bom dia "+name+"!";
    return "Boa tarde "+name+"!";
}

function mailGrade(row=null) {
    if(row === null) {
        let ui = SpreadsheetApp.getUi();
        let result = ui.prompt(
            'Sending grades...',
            'Insert the desired students rows comma separated:',
            ui.ButtonSet.OK_CANCEL);
        let button = result.getSelectedButton();
        if(button !== ui.Button.OK) {
            ui.alert('Sending grades cancelled!');
            return;
        }
        rows = result.getResponseText().split(',');
        for(row of rows)
            mailGrade(parseInt(row.trim()));
        return;
    }
    let subj = 'Notas Parciais';
    let nome = sh.getRange(row, col_name).getValue();
    let mail = sh.getRange(row, col_mail).getValue();
    Logger.log(nome+' - '+mail);
    if(mail.length === 0)
        return;
    let suspended = sh.getRange(row, col_suspended).getValue();
    if(suspended)
        return;
    let open = mailOpen(nome);
    let text = open+'\n\n';
    text += 'Seguem suas notas até o momento. Se tiver algum problema com elas ou se tiver alguma dúvida favor entrar em contato, seja respondendo esse e-mail ou pelo meio que desejar:\n';
    let sum = 0;
    let num = 0;
    let maior0 = 0;
    for(let col=col_grade0; ; col++) {
        let task = sh.getRange(1, col).getValue();
        if(task === 'Média')
            break;
        let grade = sh.getRange(row, col).getValue();
        sum += grade;
        num += 1;
        if(grade > 0)
            maior0 += 1;
        text += '- '+task+': '+grade.toString()+'\n';
    }
    text += 'O prazo da última tarefa ainda não está finalizado, então sua nota ainda pode melhorar!\n\n'
    text += 'Média das listas atuais: '+(sum/num).toString()+'\n';
    text += 'Frequência das listas atuais: '+(100*maior0/num).toString()+'%\n\n';

    text += 'Assumindo 14 listas:\n'
    text += 'Média final: '+(sum/expected_tasks).toString()+'\n';
    text += 'Frequência final: '+(100*maior0/expected_tasks).toString()+'%';
    text += '\n\nAtt,\nAndré de Freitas Smaira - 789053\nAnalista de Tecnologia da Informação - SIn\nProfessor Substituto - DC\nUniversidade Federal de São Carlos - UFSCar';
    MailApp.sendEmail(mail, subj, text);
    Logger.log('Mail sent');
    Utilities.sleep(10);
}

function mailGrades() {
    let nrwos = sh.getLastRow();
    for(let row=2; row <= nrwos; row++)
        mailGrade(row);
}

function notUpdateTasks(ra) {
    let shp = ss.getSheetByName('NaoAtualizar');
    let notup = ['lista01'];
    for(let r=2; ; r++) {
        let aux = shp.getRange(r, 1).getValue();
        if(aux.length === 0)
            return notup;
        if(aux === ra)
            for(let c=2; ; c++) {
                let task = shp.getRange(r, c).getValue();
                if(task.length === 0)
                    return notup;
                notup.push(task);
            }
    }
}

function discounts(ra) {
    ra = parseFloat(ra.toString());
    let shp = ss.getSheetByName('Descontar');
    let ds = JSON.parse('{}');
    let n_task = 0;
    for(let c=2;; c++) {
        let aux2 = shp.getRange(1, c).getValue();
        if(aux2.length === 0)
            break;
        ds[aux2] = 0;
        n_task++;
    }
    for(let r=2; ; r++) {
        let aux = shp.getRange(r, 1).getValue();
        if(aux.length === 0)
            break;
        if(aux !== ra)
            continue;
        for(let c=2; c-2 < n_task; c++) {
            let aux2 = shp.getRange(1, c).getValue();
            let d = shp.getRange(r, c).getValue();
            if(d.length === 0)
                continue;
            ds[aux2] = d;
        }
        return ds;
    }
    return ds;
}

function updateGrade(row=null) {
    let nome, github, ra;
    let task_cols = JSON.parse('{}');
    let test1, test2;
    if(row === null) {
        let ui = SpreadsheetApp.getUi();
        let result = ui.prompt(
            'Updating grades...',
            'Insert the desired students rows comma separated:',
            ui.ButtonSet.OK_CANCEL);
        let button = result.getSelectedButton();
        if(button !== ui.Button.OK) {
            ui.alert('Updating grades cancelled!');
            return;
        }
        rows = result.getResponseText().split(',');
        grade_commits_n = 100;
        for(row of rows)
            updateGrade(parseInt(row.trim()));
        return;
    }
    colorRow(row);
    dados = sh.getRange(row, 1, 1, data_cols).getValues()[0];
    ra = dados[col_ra-1];
    if(ra.length === 0)
        return null;
    nome = dados[col_name-1];
    Logger.log(nome);
    email = dados[col_mail-1];
    clas = dados[col_class-1];
    github = dados[col_git-1];
    if(github.length === 0 || !dados[col_invite-1]) {
        colorRow(row, null);
        return;
    }
    let n_ci_commits = sh.getRange(row, col_n_ci_commits).getValue();
    try {
        test1 = checkCIcommits(github, n_ci_commits);
        test2 = checkCIhash(github);
    } catch(e) { return; }
    if(nome !== 'Eu' && (!test1 || !test2)) {
        sh.getRange(row, col_edit_ci).setValue(true);
        colorRow(row, null);
        return;
    }
    let logs_urls = getRuns(github);
    let n = logs_urls.length;
    let i0 = Math.min(n-1, grade_commits_n);
    let student = JSON.parse('{}');
    let notup = notUpdateTasks(ra);
    let discs = discounts(ra);
    Logger.log('discs');
    Logger.log(discs);
    let i = 0;
    while(i < i0 && i < logs_urls.length) {
        logs_url = logs_urls[i]["logs_url"];
        let log = getGraderLog(logs_url)
        if(log.length === 0)
            continue;
        if(!checkProfGithub(log, logs_url))
            continue;
        let score = getScore(log);
        if(score.length > 0) {
            // score have the scores for each task and exercise
            // until this commit. The last commit is the most recent
            Logger.log(logs_url);
            Logger.log(score);
            for(let task of score) {
                let task_name = task["task"];
                if(notup.indexOf(task_name) > -1) {
                    Logger.log(task_name+' not updated!')
                    continue;
                }
                if(!discs[task_name])
                    discs[task_name] = 0.0;
                if(!task_cols[task_name])
                    task_cols[task_name] = taskColumn(task_name);
                if(!student[task_name]) {
                    let task_score = 0;
                    for(let ex in task["scores"])
                        task_score += task["scores"][ex];
                    student[task_name] = task_score - discs[task_name];
                }
            }
        } else { i0++; }
        i++;
    }
    for(let task in student)
        if(task_cols[task])
            sh.getRange(row, task_cols[task]).setValue(student[task]);

    colorRow(row, null);
}

function updateGrades() {
    let nrwos = sh.getLastRow();
    for(let row=2; row <= nrwos; row++)
        if(updateGrade(row) === null)
            break;
}

function setSecrets() {
    let prop = PropertiesService.getUserProperties();
    prop.setProperty('key', 'value');
}// Exceute this when need to change some secret

function getSecret(key) {
    return PropertiesService.getUserProperties().getProperty(key);
}

function test() {}