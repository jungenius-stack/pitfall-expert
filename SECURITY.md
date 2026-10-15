# Security Policy / 安全披露

## 报告漏洞

发现安全漏洞请**不要开公开 issue**，用 GitHub 私密安全通告（Security → Report a vulnerability），或联系仓库所有者。

## 范围

- hooks / dsh-plugin 的门控绕过（破坏性命令未被拦截的绕过路径）；
- engine 卡校验的注入（通过坑卡 YAML 注入任意字段/命令）；
- dod_check.py 对报告路径的越权读写。

## 不在范围

- 门控默认 report 模式「不拦截」——这是设计（`PITFALL_HOOK_MODE=block` 才是阻断），不是漏洞；
- 漏报坑（本技能公理 1：坑不可穷尽，漏报走回写不走安全流程）。
