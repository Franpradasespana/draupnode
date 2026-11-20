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
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.secretBackend = source["secretBackend"];
	        this.customPalettes = source["customPalettes"];
	    }
	}

}

