const github_user = getSecret('github_user');//professor username
const github_token = getSecret('github_token');//Github token with workflow scope
const user_token = Utilities.base64Encode(github_user+':'+github_token);
const headers = {'Authorization': 'Basic ' + user_token};
const get_params = {method: 'GET', headers: headers};

const prof_repo = 'ufscar-2021-1-PA-listas';
const prof_github = github_user+' '+prof_repo;
// github where ther graders are
const ci_hash = getCIhash('ufscar/CIgrader');
// sha of .github folder in the student github
// Change it if using another source

const ss = SpreadsheetApp.getActiveSpreadsheet();
const sh = ss.getSheetByName('Notas');

const col_ra = 1;
const col_name = 2;
const col_mail = 3;
const col_class = 4;
const col_git = 5;
const col_invite = 6;
const col_edit_ci = 7;
const col_n_ci_commits = 8;
const data_cols = 8;

const grade_commits_n = 4;


function onOpen() {
    let ui = SpreadsheetApp.getUi();
    ui.createMenu('Atualizar')
        .addItem('Notas', 'updateGrades')
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
    let url = 'https://api.github.com/repos/'+github+'/commits?path=.github&page=1&per_page=100';
    let r = UrlFetchApp.fetch(url, get_params);
    let commits = JSON.parse(r.getContentText())
        .map(commit => commit.commit.committer)
        .filter(commit => (commit.name !== github_user && commit.name !== "GitHub"))
    if(commits.length != n0) {
        Logger.log('CI files commited by student '+commits.length.toString()+' times!');
        Logger.log(commits);
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
    log = log.split('\n');
    let aux = log[log.length-1]
        .replace(/\d\d\d\d-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, '')
        .trim();
    try { return JSON.parse(aux); }
    catch (e) { Logger.log(aux); }
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

function updateGrades() {
    let nome, github, aux;
    let task_cols = JSON.parse('{}');
    let nrwos = sh.getLastRow();
    for(let row=2; row <= nrwos; row++) {
        colorRow(row);
        dados = sh.getRange(row, 1, 1, data_cols).getValues()[0];
        ra = dados[col_ra-1];
        if(ra.length === 0)
            break;
        nome = dados[col_name-1];
        Logger.log(nome);
        email = dados[col_mail-1];
        clas = dados[col_class-1];
        github = dados[col_git-1];
        if(github.length === 0 || !dados[col_invite-1]) {
            colorRow(row, null);
            continue;
        }
        let n_ci_commits = sh.getRange(row, col_n_ci_commits).getValue();
        if(nome !== 'Eu' && (!checkCIcommits(github, n_ci_commits) || !checkCIhash(github))) {
            sh.getRange(row, col_edit_ci).setValue(true);
            colorRow(row, null);
            continue;
        }
        let logs_urls = getRuns(github)
        let n = logs_urls.length;
        let i0 = Math.min(n-1, grade_commits_n);
        let student = JSON.parse('{}');
        for(let i=i0; i>=0; i--) {
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
                    let task_score = 0;
                    for(let ex in task["scores"])
                        task_score += task["scores"][ex];
                    student[task_name] = task_score;
                    if(!task_cols[task_name])
                        task_cols[task_name] = taskColumn(task_name);
                }
            }
        }
        for(let task in student)
            if(task_cols[task])
                sh.getRange(row, task_cols[task]).setValue(student[task]);

        colorRow(row, null);
    }
}

function setSecrets() {
    let prop = PropertiesService.getUserProperties();
    prop.setProperty('key', 'value');
}// Exceute this when need to change some secret

function getSecret(key) {
    return PropertiesService.getUserProperties().getProperty(key);
}

function test() {
    Logger.log(getSecret('github_token'));
}