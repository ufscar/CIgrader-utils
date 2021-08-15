const github_user = getSecret('github_user');
const github_token = getSecret('github_token');//Github token with workflow scope
const user_token = Utilities.base64Encode(github_user+':'+github_token);
const headers = {'Authorization': 'Basic ' + user_token};
const get_params = {method: 'GET', headers: headers};

const prof_github = 'afsmaira/ufscar-2021-1-PA-listas';
// github where ther graders are
const ci_hash = '258edc996d140118ea340b5d97bc3aa47f46dad6';
// sha of .github folder in the student github

const ss = SpreadsheetApp.getActiveSpreadsheet();
const sh = ss.getSheetByName('Notas');

const col_ra = 1;
const col_name = 2;
const col_mail = 3;
const col_class = 4;
const col_git = 5;
const data_cols = 5;

function checkProfGithub(log, logs_url) {
    let prof_githubs = log.match(/PROFESSOR GITHUB: ([^\n]+)/g) || [];
    if(prof_githubs.length != 1) {
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

function checkCIcommits(github) {
    let r = UrlFetchApp.fetch('https://api.github.com/repos/'+github+'/commits?path=.github&page=1&per_page=100', get_params);
    let commits = JSON.parse(r.getContentText())
        .map(commit => commit.commit.committer)
        .filter(commit => commit.name !== github_user)
    if(commits.length > 1) {
        Logger.log('CI files commited by student!');
        return false;
    }
    return true;
}

function checkCIhash(github) {
    let r = UrlFetchApp.fetch('https://api.github.com/repos/'+github+'/contents', get_params);
    let h = JSON.parse(r.getContentText())
        .filter(f => (f.name == ".github" && f.type == "dir"))
        .map(f => f.sha)
    if(h.length !== 1) {
        Logger.log('Hash verification error!')
        return false;
    }
    if(h[0] !== ci_hash) {
        Logger.log('CI files sha unknown!');
        Logger.log(h[0]);
        Logger.log(ci_hash);
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
    r = UrlFetchApp.fetch(url, get_params);
    let zip = r.getBlob();
    let log_file = Utilities.unzip(zip).filter(f => f.getName().includes('Grader'));
    if(log_file.length > 0) {
        log_file = log_file[0];
        return log_file.getDataAsString().trim();
    }
    return "";
}

function updateGrades() {
    let nome, email, github, aux;
    for(let row=2; ; row++) {
        dados = sh.getRange(row, 1, 1, data_cols).getValues()[0];
        ra = dados[col_ra-1];
        if(ra.length === 0)
            break;
        nome = dados[col_name-1];
        Logger.log(nome);
        email = dados[col_mail-1];
        clas = dados[col_class-1];
        github = dados[col_git-1];
        if(github.length === 0)
            continue;
        if(!checkCIcommits(github) || !checkCIhash(github))
            continue;
        let logs_urls = getRuns(github)
        let n = logs_urls.length;
        let i0 = Math.min(n-1, 10);
        for(let i=i0; i>=0; i--) {
            logs_url = logs_urls[i]["logs_url"];
            let log = getGraderLog(logs_url)
            if(log.length === 0)
                continue;
            if(!checkProfGithub(log, logs_url))
                continue;
            let score = getScore(log);
            if(score.length > 0) {
                Logger.log(logs_url);
                Logger.log(score);
                for(let task of score) {
                    let task_name = task["task"];
                    let task_score = 0;
                    for(let ex in task["scores"])
                        task_score += task["scores"][ex];
                    Logger.log(task_name+': '+task_score.toString());
                }
            }
        }
    }
}

function setSecrets() {
    let prop = PropertiesService.getUserProperties();
    prop.setProperty('key', 'value');
}// Exceute this when need to change some secret

function getSecret(key) {
    return PropertiesService.getUserProperties().getProperty(key);
}