export namespace copia {
	
	export class KeyFile {
	    serverId: string;
	    server: string;
	    file: string;
	    origPath: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.server = source["server"];
	        this.file = source["file"];
	        this.origPath = source["origPath"];
	    }
	}
	export class Manifest {
	    version: number;
	    // Go type: time
	    created: any;
	    app: string;
	    servers: number;
	    templates: number;
	    deployments: number;
	    vaultEntries: number;
	    keyring: number;
	    modules: number;
	    keys: KeyFile[];
	
	    static createFrom(source: any = {}) {
	        return new Manifest(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.created = this.convertValues(source["created"], null);
	        this.app = source["app"];
	        this.servers = source["servers"];
	        this.templates = source["templates"];
	        this.deployments = source["deployments"];
	        this.vaultEntries = source["vaultEntries"];
	        this.keyring = source["keyring"];
	        this.modules = source["modules"];
	        this.keys = this.convertValues(source["keys"], KeyFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace dockerize {
	
	export class Spec {
	    stack: string;
	    framework: string;
	    name: string;
	    version: string;
	    port: number;
	    hostPort: number;
	    start: string;
	    pyInstall: string;
	    module: string;
	    extraPip: string[];
	    djangoMigrate: boolean;
	    djangoCollectstatic: boolean;
	    djangoSuperuser: boolean;
	    nodePm: string;
	    nodeBuild: boolean;
	    nodeLock: boolean;
	    staticDir: string;
	    javaBuild: string;
	    javaWrapper: boolean;
	    docRoot: string;
	    laravelMigrate: boolean;
	    goMain: string;
	    systemPackages: string[];
	    volumes: string[];
	    envKeys: string[];
	    nonRoot: boolean;
	    healthPath: string;
	    postgres: boolean;
	    mariadb: boolean;
	    redis: boolean;
	    dbMode: string;
	    sharedNetwork: string;
	    sharedHost: string;
	    sideBySide: boolean;
	    proxy: boolean;
	    proxyDomain: string;
	    proxyPort: number;
	    maxBodyMb: number;
	
	    static createFrom(source: any = {}) {
	        return new Spec(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.stack = source["stack"];
	        this.framework = source["framework"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.port = source["port"];
	        this.hostPort = source["hostPort"];
	        this.start = source["start"];
	        this.pyInstall = source["pyInstall"];
	        this.module = source["module"];
	        this.extraPip = source["extraPip"];
	        this.djangoMigrate = source["djangoMigrate"];
	        this.djangoCollectstatic = source["djangoCollectstatic"];
	        this.djangoSuperuser = source["djangoSuperuser"];
	        this.nodePm = source["nodePm"];
	        this.nodeBuild = source["nodeBuild"];
	        this.nodeLock = source["nodeLock"];
	        this.staticDir = source["staticDir"];
	        this.javaBuild = source["javaBuild"];
	        this.javaWrapper = source["javaWrapper"];
	        this.docRoot = source["docRoot"];
	        this.laravelMigrate = source["laravelMigrate"];
	        this.goMain = source["goMain"];
	        this.systemPackages = source["systemPackages"];
	        this.volumes = source["volumes"];
	        this.envKeys = source["envKeys"];
	        this.nonRoot = source["nonRoot"];
	        this.healthPath = source["healthPath"];
	        this.postgres = source["postgres"];
	        this.mariadb = source["mariadb"];
	        this.redis = source["redis"];
	        this.dbMode = source["dbMode"];
	        this.sharedNetwork = source["sharedNetwork"];
	        this.sharedHost = source["sharedHost"];
	        this.sideBySide = source["sideBySide"];
	        this.proxy = source["proxy"];
	        this.proxyDomain = source["proxyDomain"];
	        this.proxyPort = source["proxyPort"];
	        this.maxBodyMb = source["maxBodyMb"];
	    }
	}
	export class Analysis {
	    dir: string;
	    name: string;
	    spec: Spec;
	    evidence: string[];
	    warnings: string[];
	    existing: string[];
	    alternatives: string[];
	
	    static createFrom(source: any = {}) {
	        return new Analysis(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.dir = source["dir"];
	        this.name = source["name"];
	        this.spec = this.convertValues(source["spec"], Spec);
	        this.evidence = source["evidence"];
	        this.warnings = source["warnings"];
	        this.existing = source["existing"];
	        this.alternatives = source["alternatives"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace lab {
	
	export class DockerStatus {
	    os: string;
	    installed: boolean;
	    version?: string;
	    problem: string;
	    message?: string;
	    needsRelogin: boolean;
	    viaGroup: boolean;
	    canAutoFix: boolean;
	    installCommand: string;
	    downloadUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new DockerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.os = source["os"];
	        this.installed = source["installed"];
	        this.version = source["version"];
	        this.problem = source["problem"];
	        this.message = source["message"];
	        this.needsRelogin = source["needsRelogin"];
	        this.viaGroup = source["viaGroup"];
	        this.canAutoFix = source["canAutoFix"];
	        this.installCommand = source["installCommand"];
	        this.downloadUrl = source["downloadUrl"];
	    }
	}
	export class KeyFile {
	    path: string;
	    label: string;
	    passphrase?: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.label = source["label"];
	        this.passphrase = source["passphrase"];
	    }
	}
	export class ServerStatus {
	    exists: boolean;
	    running: boolean;
	    startedAt?: string;
	    byPort?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ServerStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exists = source["exists"];
	        this.running = source["running"];
	        this.startedAt = source["startedAt"];
	        this.byPort = source["byPort"];
	    }
	}

}

export namespace main {
	
	export class AlertsResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    ok: boolean;
	    output?: string;
	
	    static createFrom(source: any = {}) {
	        return new AlertsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.ok = source["ok"];
	        this.output = source["output"];
	    }
	}
	export class AppInfo {
	    version: string;
	    configDir: string;
	    os: string;
	
	    static createFrom(source: any = {}) {
	        return new AppInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.configDir = source["configDir"];
	        this.os = source["os"];
	    }
	}
	export class BackupDue {
	    projectId: string;
	    name: string;
	    mode: string;
	    days: number;
	    age: number;
	    dest: string;
	
	    static createFrom(source: any = {}) {
	        return new BackupDue(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projectId = source["projectId"];
	        this.name = source["name"];
	        this.mode = source["mode"];
	        this.days = source["days"];
	        this.age = source["age"];
	        this.dest = source["dest"];
	    }
	}
	export class SnapEntry {
	    name: string;
	    path: string;
	    type: string;
	    size: number;
	    // Go type: time
	    mtime: any;
	
	    static createFrom(source: any = {}) {
	        return new SnapEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.type = source["type"];
	        this.size = source["size"];
	        this.mtime = this.convertValues(source["mtime"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Snapshot {
	    id: string;
	    // Go type: time
	    time: any;
	    tags: string[];
	    paths: string[];
	    host: string;
	    bytes?: number;
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.time = this.convertValues(source["time"], null);
	        this.tags = source["tags"];
	        this.paths = source["paths"];
	        this.host = source["host"];
	        this.bytes = source["bytes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupRestoreResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    snapshots?: Snapshot[];
	    output?: string;
	    ok: boolean;
	    fetch?: store.FetchInfo;
	    entries?: SnapEntry[];
	
	    static createFrom(source: any = {}) {
	        return new BackupRestoreResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.snapshots = this.convertValues(source["snapshots"], Snapshot);
	        this.output = source["output"];
	        this.ok = source["ok"];
	        this.fetch = this.convertValues(source["fetch"], store.FetchInfo);
	        this.entries = this.convertValues(source["entries"], SnapEntry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    snapshots?: Snapshot[];
	    output?: string;
	    ok: boolean;
	    fetch?: store.FetchInfo;
	
	    static createFrom(source: any = {}) {
	        return new BackupResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.snapshots = this.convertValues(source["snapshots"], Snapshot);
	        this.output = source["output"];
	        this.ok = source["ok"];
	        this.fetch = this.convertValues(source["fetch"], store.FetchInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupStatus {
	    // Go type: time
	    lastExport?: any;
	
	    static createFrom(source: any = {}) {
	        return new BackupStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.lastExport = this.convertValues(source["lastExport"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupTargetResult {
	    targetProjectId: string;
	    targetProjectName: string;
	    targetIsNew: boolean;
	    url: string;
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new BackupTargetResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.targetProjectId = source["targetProjectId"];
	        this.targetProjectName = source["targetProjectName"];
	        this.targetIsNew = source["targetIsNew"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	    }
	}
	export class Deployment {
	    projectId: string;
	    serverId: string;
	    serverName: string;
	    applied: boolean;
	    pending: boolean;
	    sameRecipe: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Deployment(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projectId = source["projectId"];
	        this.serverId = source["serverId"];
	        this.serverName = source["serverName"];
	        this.applied = source["applied"];
	        this.pending = source["pending"];
	        this.sameRecipe = source["sameRecipe"];
	    }
	}
	export class DockerFile {
	    name: string;
	    content: string;
	    exists: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DockerFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.content = source["content"];
	        this.exists = source["exists"];
	    }
	}
	export class DockerInfo {
	    versions: Record<string, Array<string>>;
	    docker: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DockerInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.versions = source["versions"];
	        this.docker = source["docker"];
	    }
	}
	export class DockerPreview {
	    files: DockerFile[];
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new DockerPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], DockerFile);
	        this.errors = source["errors"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FetchSecretsResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new FetchSecretsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.count = source["count"];
	    }
	}
	export class GitEnvVar {
	    key: string;
	    example?: string;
	    inExample: boolean;
	    inCompose: boolean;
	    hasDefault: boolean;
	    secret: boolean;
	    external: boolean;
	    hint?: string;
	
	    static createFrom(source: any = {}) {
	        return new GitEnvVar(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.example = source["example"];
	        this.inExample = source["inExample"];
	        this.inCompose = source["inCompose"];
	        this.hasDefault = source["hasDefault"];
	        this.secret = source["secret"];
	        this.external = source["external"];
	        this.hint = source["hint"];
	    }
	}
	export class GitInspectResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    commit?: string;
	    composeFound: boolean;
	    exampleFile?: string;
	    vars: GitEnvVar[];
	
	    static createFrom(source: any = {}) {
	        return new GitInspectResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.commit = source["commit"];
	        this.composeFound = source["composeFound"];
	        this.exampleFile = source["exampleFile"];
	        this.vars = this.convertValues(source["vars"], GitEnvVar);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportResult {
	    notes: string[];
	    safety: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.notes = source["notes"];
	        this.safety = source["safety"];
	    }
	}
	export class KeyResult {
	    path: string;
	    name: string;
	    format: string;
	    keyType?: string;
	    encrypted: boolean;
	    comment?: string;
	    source?: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.format = source["format"];
	        this.keyType = source["keyType"];
	        this.encrypted = source["encrypted"];
	        this.comment = source["comment"];
	        this.source = source["source"];
	        this.error = source["error"];
	    }
	}
	export class KeyringInfo {
	    available: boolean;
	    name: string;
	    suggestions?: secrets.Suggestion[];
	
	    static createFrom(source: any = {}) {
	        return new KeyringInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.available = source["available"];
	        this.name = source["name"];
	        this.suggestions = this.convertValues(source["suggestions"], secrets.Suggestion);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LabStatus {
	    docker: lab.DockerStatus;
	    server: lab.ServerStatus;
	    keys: lab.KeyFile[];
	    fingerprint: string;
	    host: string;
	    port: number;
	    user: string;
	    password: string;
	    coolifyUrl: string;
	    coolifyUp: boolean;
	    serverId?: string;
	    busy?: string;
	
	    static createFrom(source: any = {}) {
	        return new LabStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.docker = this.convertValues(source["docker"], lab.DockerStatus);
	        this.server = this.convertValues(source["server"], lab.ServerStatus);
	        this.keys = this.convertValues(source["keys"], lab.KeyFile);
	        this.fingerprint = source["fingerprint"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.password = source["password"];
	        this.coolifyUrl = source["coolifyUrl"];
	        this.coolifyUp = source["coolifyUp"];
	        this.serverId = source["serverId"];
	        this.busy = source["busy"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ModulesInfo {
	    modules: modules.Module[];
	    errors: string[];
	    userDir: string;
	
	    static createFrom(source: any = {}) {
	        return new ModulesInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.modules = this.convertValues(source["modules"], modules.Module);
	        this.errors = source["errors"];
	        this.userDir = source["userDir"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TargetState {
	    job: string;
	    up: boolean;
	
	    static createFrom(source: any = {}) {
	        return new TargetState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.job = source["job"];
	        this.up = source["up"];
	    }
	}
	export class MonitorStats {
	    cpu: number;
	    ram: number;
	    ramTotal: number;
	    disk: number;
	    diskFree: number;
	    load: number;
	    cpus: number;
	    uptime: number;
	    containers: number;
	    targets: TargetState[];
	    // Go type: time
	    at: any;
	
	    static createFrom(source: any = {}) {
	        return new MonitorStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cpu = source["cpu"];
	        this.ram = source["ram"];
	        this.ramTotal = source["ramTotal"];
	        this.disk = source["disk"];
	        this.diskFree = source["diskFree"];
	        this.load = source["load"];
	        this.cpus = source["cpus"];
	        this.uptime = source["uptime"];
	        this.containers = source["containers"];
	        this.targets = this.convertValues(source["targets"], TargetState);
	        this.at = this.convertValues(source["at"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MonitorResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    url?: string;
	    stats?: MonitorStats;
	
	    static createFrom(source: any = {}) {
	        return new MonitorResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.url = source["url"];
	        this.stats = this.convertValues(source["stats"], MonitorStats);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class ProjectCheck {
	    order: string[];
	    added: string[];
	    errors: Record<string, any>;
	    general: string[];
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new ProjectCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.order = source["order"];
	        this.added = source["added"];
	        this.errors = source["errors"];
	        this.general = source["general"];
	        this.warnings = source["warnings"];
	    }
	}
	export class ProjectSecret {
	    kind: string;
	    module: string;
	    label: string;
	    name: string;
	    value: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectSecret(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.kind = source["kind"];
	        this.module = source["module"];
	        this.label = source["label"];
	        this.name = source["name"];
	        this.value = source["value"];
	    }
	}
	export class ProjectSecretsSummary {
	    vaultExists: boolean;
	    generated: number;
	    typed: string[];
	    at?: string;
	
	    static createFrom(source: any = {}) {
	        return new ProjectSecretsSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vaultExists = source["vaultExists"];
	        this.generated = source["generated"];
	        this.typed = source["typed"];
	        this.at = source["at"];
	    }
	}
	export class RecipeDiff {
	    recipeId: string;
	    recipeName: string;
	    added: string[];
	    removed: string[];
	    changed: Record<string, Array<string>>;
	
	    static createFrom(source: any = {}) {
	        return new RecipeDiff(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.recipeId = source["recipeId"];
	        this.recipeName = source["recipeName"];
	        this.added = source["added"];
	        this.removed = source["removed"];
	        this.changed = source["changed"];
	    }
	}
	export class RecipeView {
	    id: string;
	    name: string;
	    notes?: string;
	    modules: store.ProjectModule[];
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    deployments: Deployment[];
	
	    static createFrom(source: any = {}) {
	        return new RecipeView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.notes = source["notes"];
	        this.modules = this.convertValues(source["modules"], store.ProjectModule);
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.deployments = this.convertValues(source["deployments"], Deployment);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RecoverResult {
	    project: store.Project;
	    notes: string[];
	
	    static createFrom(source: any = {}) {
	        return new RecoverResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project = this.convertValues(source["project"], store.Project);
	        this.notes = source["notes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunEntry {
	    projectId: string;
	    project: string;
	    serverId: string;
	    server: string;
	    name: string;
	    // Go type: time
	    at: any;
	    mode: string;
	    known: boolean;
	    ok: boolean;
	    canceled: boolean;
	    changed: number;
	    failed: number;
	    error?: string;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new RunEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.projectId = source["projectId"];
	        this.project = source["project"];
	        this.serverId = source["serverId"];
	        this.server = source["server"];
	        this.name = source["name"];
	        this.at = this.convertValues(source["at"], null);
	        this.mode = source["mode"];
	        this.known = source["known"];
	        this.ok = source["ok"];
	        this.canceled = source["canceled"];
	        this.changed = source["changed"];
	        this.failed = source["failed"];
	        this.error = source["error"];
	        this.durationMs = source["durationMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RunStart {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	
	    static createFrom(source: any = {}) {
	        return new RunStart(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	    }
	}
	export class SecretsInfo {
	    keyring: KeyringInfo;
	    vault: secrets.Status;
	    backend: string;
	    effective: string;
	
	    static createFrom(source: any = {}) {
	        return new SecretsInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.keyring = this.convertValues(source["keyring"], KeyringInfo);
	        this.vault = this.convertValues(source["vault"], secrets.Status);
	        this.backend = source["backend"];
	        this.effective = source["effective"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ServerLive {
	    reachable: boolean;
	    latencyMs: number;
	    error?: string;
	    webUrl?: string;
	    webLabel?: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerLive(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.reachable = source["reachable"];
	        this.latencyMs = source["latencyMs"];
	        this.error = source["error"];
	        this.webUrl = source["webUrl"];
	        this.webLabel = source["webLabel"];
	    }
	}
	export class ServerLogsResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    text?: string;
	
	    static createFrom(source: any = {}) {
	        return new ServerLogsResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.text = source["text"];
	    }
	}
	export class ServerOverviewResult {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    overview?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new ServerOverviewResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.overview = source["overview"];
	    }
	}
	export class ServerPing {
	    id: string;
	    reachable: boolean;
	    latencyMs: number;
	    lab: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ServerPing(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.reachable = source["reachable"];
	        this.latencyMs = source["latencyMs"];
	        this.lab = source["lab"];
	    }
	}
	export class ServerView {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    authMethod: string;
	    keyPath: string;
	    keyEncrypted: boolean;
	    secretStore: string;
	    notes: string;
	    // Go type: time
	    createdAt: any;
	    lastCheck?: store.CheckResult;
	    hasSecret: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ServerView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.authMethod = source["authMethod"];
	        this.keyPath = source["keyPath"];
	        this.keyEncrypted = source["keyEncrypted"];
	        this.secretStore = source["secretStore"];
	        this.notes = source["notes"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.lastCheck = this.convertValues(source["lastCheck"], store.CheckResult);
	        this.hasSecret = source["hasSecret"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class TermStart {
	    status: string;
	    runId?: string;
	    message?: string;
	    secretKind?: string;
	    keyType?: string;
	    fingerprint?: string;
	    id?: string;
	
	    static createFrom(source: any = {}) {
	        return new TermStart(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.runId = source["runId"];
	        this.message = source["message"];
	        this.secretKind = source["secretKind"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.id = source["id"];
	    }
	}
	export class TestResult {
	    status: string;
	    secretKind?: string;
	    message: string;
	    keyType?: string;
	    fingerprint?: string;
	    facts?: Record<string, string>;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new TestResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.secretKind = source["secretKind"];
	        this.message = source["message"];
	        this.keyType = source["keyType"];
	        this.fingerprint = source["fingerprint"];
	        this.facts = source["facts"];
	        this.durationMs = source["durationMs"];
	    }
	}
	export class UninstallInfo {
	    id: string;
	    name: string;
	    warning?: string;
	    data?: string;
	
	    static createFrom(source: any = {}) {
	        return new UninstallInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.warning = source["warning"];
	        this.data = source["data"];
	    }
	}
	export class UninstallCheck {
	    ok: boolean;
	    error?: string;
	    modules: UninstallInfo[];
	    hasData: boolean;
	    server: string;
	    selected: string[];
	
	    static createFrom(source: any = {}) {
	        return new UninstallCheck(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.modules = this.convertValues(source["modules"], UninstallInfo);
	        this.hasData = source["hasData"];
	        this.server = source["server"];
	        this.selected = source["selected"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class UpdateInfo {
	    current: string;
	    latest: string;
	    newer: boolean;
	    url: string;
	    notes?: string;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.current = source["current"];
	        this.latest = source["latest"];
	        this.newer = source["newer"];
	        this.url = source["url"];
	        this.notes = source["notes"];
	        this.enabled = source["enabled"];
	    }
	}
	export class UserModule {
	    id: string;
	    name: string;
	    files: string[];
	    problems: string[];
	    notes: string[];
	    usedBy?: string[];
	
	    static createFrom(source: any = {}) {
	        return new UserModule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.files = source["files"];
	        this.problems = source["problems"];
	        this.notes = source["notes"];
	        this.usedBy = source["usedBy"];
	    }
	}

}

export namespace modules {
	
	export class Check {
	    containerFree?: string;
	
	    static createFrom(source: any = {}) {
	        return new Check(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.containerFree = source["containerFree"];
	    }
	}
	export class Link {
	    label: string;
	    url: string;
	
	    static createFrom(source: any = {}) {
	        return new Link(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.url = source["url"];
	    }
	}
	export class SecretFile {
	    file: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new SecretFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.file = source["file"];
	        this.label = source["label"];
	    }
	}
	export class ProxySite {
	    domain: string;
	    port: string;
	
	    static createFrom(source: any = {}) {
	        return new ProxySite(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.domain = source["domain"];
	        this.port = source["port"];
	    }
	}
	export class Variable {
	    name: string;
	    label: string;
	    help?: string;
	    type: string;
	    default: any;
	    options?: string[];
	    required?: boolean;
	    pattern?: string;
	    patternHelp?: string;
	    min?: number;
	    max?: number;
	    placeholder?: string;
	    managed?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Variable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.label = source["label"];
	        this.help = source["help"];
	        this.type = source["type"];
	        this.default = source["default"];
	        this.options = source["options"];
	        this.required = source["required"];
	        this.pattern = source["pattern"];
	        this.patternHelp = source["patternHelp"];
	        this.min = source["min"];
	        this.max = source["max"];
	        this.placeholder = source["placeholder"];
	        this.managed = source["managed"];
	    }
	}
	export class Requires {
	    os?: string[];
	    minRamMb?: number;
	    minDiskGb?: number;
	
	    static createFrom(source: any = {}) {
	        return new Requires(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.os = source["os"];
	        this.minRamMb = source["minRamMb"];
	        this.minDiskGb = source["minDiskGb"];
	    }
	}
	export class Module {
	    id: string;
	    name: string;
	    version: string;
	    category: string;
	    description: string;
	    details?: string;
	    depends: string[];
	    requires: Requires;
	    variables: Variable[];
	    firewallPorts?: number[];
	    firewallPortsFrom?: string[];
	    udpPortsFrom?: string[];
	    proxySite?: ProxySite;
	    links?: Link[];
	    conflicts?: string[];
	    after?: string[];
	    checks?: Check[];
	    secrets?: SecretFile[];
	    uninstallable: boolean;
	    uninstallWarning?: string;
	    uninstallData?: string;
	    noUninstall?: string;
	    source: string;
	    files: string[];
	
	    static createFrom(source: any = {}) {
	        return new Module(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.version = source["version"];
	        this.category = source["category"];
	        this.description = source["description"];
	        this.details = source["details"];
	        this.depends = source["depends"];
	        this.requires = this.convertValues(source["requires"], Requires);
	        this.variables = this.convertValues(source["variables"], Variable);
	        this.firewallPorts = source["firewallPorts"];
	        this.firewallPortsFrom = source["firewallPortsFrom"];
	        this.udpPortsFrom = source["udpPortsFrom"];
	        this.proxySite = this.convertValues(source["proxySite"], ProxySite);
	        this.links = this.convertValues(source["links"], Link);
	        this.conflicts = source["conflicts"];
	        this.after = source["after"];
	        this.checks = this.convertValues(source["checks"], Check);
	        this.secrets = this.convertValues(source["secrets"], SecretFile);
	        this.uninstallable = source["uninstallable"];
	        this.uninstallWarning = source["uninstallWarning"];
	        this.uninstallData = source["uninstallData"];
	        this.noUninstall = source["noUninstall"];
	        this.source = source["source"];
	        this.files = source["files"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	

}

export namespace secrets {
	
	export class Status {
	    exists: boolean;
	    unlocked: boolean;
	    path: string;
	    entries: number;
	
	    static createFrom(source: any = {}) {
	        return new Status(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.exists = source["exists"];
	        this.unlocked = source["unlocked"];
	        this.path = source["path"];
	        this.entries = source["entries"];
	    }
	}
	export class Suggestion {
	    name: string;
	    description: string;
	    command?: string;
	
	    static createFrom(source: any = {}) {
	        return new Suggestion(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.command = source["command"];
	    }
	}

}

export namespace sshx {
	
	export class ConfigHost {
	    alias: string;
	    hostName: string;
	    user: string;
	    port: number;
	    identityFile: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigHost(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.alias = source["alias"];
	        this.hostName = source["hostName"];
	        this.user = source["user"];
	        this.port = source["port"];
	        this.identityFile = source["identityFile"];
	    }
	}
	export class KeyInfo {
	    path: string;
	    name: string;
	    format: string;
	    keyType?: string;
	    encrypted: boolean;
	    comment?: string;
	    source?: string;
	
	    static createFrom(source: any = {}) {
	        return new KeyInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.format = source["format"];
	        this.keyType = source["keyType"];
	        this.encrypted = source["encrypted"];
	        this.comment = source["comment"];
	        this.source = source["source"];
	    }
	}

}

export namespace store {
	
	export class BackupsAuto {
	    mode: string;
	    days: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupsAuto(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.mode = source["mode"];
	        this.days = source["days"];
	    }
	}
	export class CheckResult {
	    // Go type: time
	    at: any;
	    ok: boolean;
	    error?: string;
	    facts?: Record<string, string>;
	    durationMs: number;
	
	    static createFrom(source: any = {}) {
	        return new CheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.at = this.convertValues(source["at"], null);
	        this.ok = source["ok"];
	        this.error = source["error"];
	        this.facts = source["facts"];
	        this.durationMs = source["durationMs"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FetchInfo {
	    // Go type: time
	    at: any;
	    dir: string;
	    bytes: number;
	    files: number;
	
	    static createFrom(source: any = {}) {
	        return new FetchInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.at = this.convertValues(source["at"], null);
	        this.dir = source["dir"];
	        this.bytes = source["bytes"];
	        this.files = source["files"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Overrides {
	    added?: string[];
	    removed?: string[];
	    values?: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new Overrides(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.added = source["added"];
	        this.removed = source["removed"];
	        this.values = source["values"];
	    }
	}
	export class RunSummary {
	    // Go type: time
	    at: any;
	    check: boolean;
	    ok: boolean;
	    canceled?: boolean;
	    changed: number;
	    failed: number;
	    tasks: number;
	    error?: string;
	    logFile?: string;
	    durationMs: number;
	    uninstall?: boolean;
	    completed?: string[];
	
	    static createFrom(source: any = {}) {
	        return new RunSummary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.at = this.convertValues(source["at"], null);
	        this.check = source["check"];
	        this.ok = source["ok"];
	        this.canceled = source["canceled"];
	        this.changed = source["changed"];
	        this.failed = source["failed"];
	        this.tasks = source["tasks"];
	        this.error = source["error"];
	        this.logFile = source["logFile"];
	        this.durationMs = source["durationMs"];
	        this.uninstall = source["uninstall"];
	        this.completed = source["completed"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ProjectModule {
	    id: string;
	    values: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new ProjectModule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.values = source["values"];
	    }
	}
	export class Project {
	    id: string;
	    name: string;
	    serverId: string;
	    modules: ProjectModule[];
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    lastRun?: RunSummary;
	    // Go type: time
	    appliedAt?: any;
	    collapsed?: string[];
	    slug?: string;
	    installedModules?: string[];
	    installedValues?: Record<string, any>;
	    backupsFetched?: FetchInfo;
	    backupsAuto?: BackupsAuto;
	    recipeId?: string;
	    overrides?: Overrides;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.serverId = source["serverId"];
	        this.modules = this.convertValues(source["modules"], ProjectModule);
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.lastRun = this.convertValues(source["lastRun"], RunSummary);
	        this.appliedAt = this.convertValues(source["appliedAt"], null);
	        this.collapsed = source["collapsed"];
	        this.slug = source["slug"];
	        this.installedModules = source["installedModules"];
	        this.installedValues = source["installedValues"];
	        this.backupsFetched = this.convertValues(source["backupsFetched"], FetchInfo);
	        this.backupsAuto = this.convertValues(source["backupsAuto"], BackupsAuto);
	        this.recipeId = source["recipeId"];
	        this.overrides = this.convertValues(source["overrides"], Overrides);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Recipe {
	    id: string;
	    name: string;
	    notes?: string;
	    modules: ProjectModule[];
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Recipe(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.notes = source["notes"];
	        this.modules = this.convertValues(source["modules"], ProjectModule);
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class Server {
	    id: string;
	    name: string;
	    host: string;
	    port: number;
	    user: string;
	    authMethod: string;
	    keyPath: string;
	    keyEncrypted: boolean;
	    secretStore: string;
	    notes: string;
	    // Go type: time
	    createdAt: any;
	    lastCheck?: CheckResult;
	
	    static createFrom(source: any = {}) {
	        return new Server(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.host = source["host"];
	        this.port = source["port"];
	        this.user = source["user"];
	        this.authMethod = source["authMethod"];
	        this.keyPath = source["keyPath"];
	        this.keyEncrypted = source["keyEncrypted"];
	        this.secretStore = source["secretStore"];
	        this.notes = source["notes"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.lastCheck = this.convertValues(source["lastCheck"], CheckResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    theme: string;
	    secretBackend: string;
	    customPalettes?: number[];
	    noUpdateCheck?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.secretBackend = source["secretBackend"];
	        this.customPalettes = source["customPalettes"];
	        this.noUpdateCheck = source["noUpdateCheck"];
	    }
	}

}

