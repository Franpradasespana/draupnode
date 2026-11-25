# Draupnode: imprime cada evento de Ansible como una línea «@@DN {json}»
# para que la aplicación pinte el progreso tarea a tarea.
from __future__ import annotations

import json
import sys

from ansible.plugins.callback import CallbackBase

DOCUMENTATION = """
    name: draupnode
    type: stdout
    short_description: Eventos en JSON para Draupnode
    description: Una línea «@@DN {json}» por evento.
"""


def _short(text, limit=4000):
    text = text or ""
    return text if len(text) <= limit else "…" + text[-limit:]


class CallbackModule(CallbackBase):
    CALLBACK_VERSION = 2.0
    CALLBACK_TYPE = "stdout"
    CALLBACK_NAME = "draupnode"

    def _emit(self, **data):
        sys.stdout.write("@@DN " + json.dumps(data, ensure_ascii=False, default=str) + "\n")
        sys.stdout.flush()

    def _role(self, task):
        role = getattr(task, "_role", None)
        return role.get_name() if role else ""

    def _msg(self, res):
        r = res._result
        if r.get("_ansible_no_log"):
            return "(salida oculta: contiene secretos)"
        parts = [r.get("msg") or ""]
        for key in ("stderr", "stdout"):
            if r.get(key):
                parts.append(_short(r[key]))
        return "\n".join(p for p in parts if p).strip()

    def v2_playbook_on_play_start(self, play):
        self._emit(ev="play", name=play.get_name())
        # Cuántas tareas tiene la obra (las fijas; un include_tasks cuenta como
        # una): la aplicación lo usa para la barra de progreso.
        try:
            self._emit(ev="plan", total=self._count(play.compile()))
        except Exception:  # noqa: BLE001 - solo es para la barra
            pass

    def _count(self, blocks):
        n = 0
        for b in blocks or []:
            for part in (getattr(b, "block", None), getattr(b, "rescue", None), getattr(b, "always", None)):
                for t in part or []:
                    if hasattr(t, "block"):
                        n += self._count([t])
                    elif getattr(t, "action", "") != "meta":
                        n += 1
        return n

    def v2_playbook_on_task_start(self, task, is_conditional):
        self._emit(ev="task", name=task.get_name(), role=self._role(task))

    def v2_playbook_on_handler_task_start(self, task):
        self._emit(ev="task", name=task.get_name(), role=self._role(task), handler=True)

    def v2_runner_on_ok(self, result):
        data = dict(ev="ok", changed=bool(result._result.get("changed")))
        if result._task.action in ("debug", "ansible.builtin.debug") and "msg" in result._result:
            data["note"] = str(result._result["msg"])
        self._emit(**data)

    def v2_runner_on_failed(self, result, ignore_errors=False):
        self._emit(ev="failed", ignored=bool(ignore_errors), msg=self._msg(result))

    def v2_runner_on_skipped(self, result):
        self._emit(ev="skipped")

    def v2_runner_on_unreachable(self, result):
        self._emit(ev="failed", msg=self._msg(result))

    def v2_runner_item_on_failed(self, result):
        self._emit(ev="item_failed", item=str(self._get_item_label(result._result)), msg=self._msg(result))

    def v2_on_file_diff(self, result):
        diff = result._result.get("diff")
        if diff and not result._result.get("_ansible_no_log"):
            text = self._get_diff(diff)
            if text and text.strip():
                self._emit(ev="diff", text=_short(text))

    def v2_playbook_on_stats(self, stats):
        totals = {"ok": 0, "changed": 0, "failures": 0, "unreachable": 0, "skipped": 0}
        for host in sorted(stats.processed.keys()):
            s = stats.summarize(host)
            for k in totals:
                totals[k] += s.get(k, 0)
        self._emit(ev="stats", **totals)

    def v2_playbook_on_no_hosts_matched(self):
        self._emit(ev="failed", msg="No hay hosts")
