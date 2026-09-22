# Operação do sistema da clínica

Guia prático para quem cuida do app da Clínica Dra. Bruna Oliveira.
Quem mexe no dia a dia não precisa disto — é para emergência e manutenção.

## Onde está cada coisa

| O quê | Onde | Para quê |
|---|---|---|
| Site | https://clinica-bruna-oliveira.vercel.app | o app que a equipe usa |
| Formulário do paciente | https://clinica-bruna-oliveira.vercel.app/ficha | link público, sem senha |
| Código | github.com/ErickMendes341/Clinica-Bruna-Oliveira- | histórico de tudo que foi feito |
| Publicação | vercel.com | publica sozinho a cada envio ao GitHub |
| Dados | supabase.com — projeto "Clinica Bruna Oliveira" | pacientes, agenda, estoque, pagamentos |

## Cópia de segurança (o mais importante)

O app tem o botão **💾 Exportar tudo** na aba Pacientes. Ele baixa um `.zip`
com planilhas (abrem no Excel) e um `tecnico.json` que serve para recolocar
os dados no sistema.

- **Faça uma vez por semana.** Passados 7 dias, aparece um aviso vermelho no
  topo do app até alguém exportar.
- **Guarde fora do computador da clínica**: pen drive, Google Drive ou
  mandando para o próprio e-mail. Cópia que fica só na máquina não protege
  contra roubo, incêndio ou o disco queimar.
- Mantenha as 4 últimas. Se um erro só for notado semanas depois, as cópias
  antigas salvam.

> O plano gratuito da Supabase **não faz backup automático**. Enquanto for
> assim, essa exportação é a única rede de proteção. O plano Pro (US$ 25/mês)
> acrescenta backup diário e impede que o projeto seja pausado por 7 dias sem uso.

## Contas: proteção e acesso de emergência

Hoje tudo está na conta pessoal do Erick. Se ele perder o acesso, ninguém
consegue publicar correção nem recuperar a senha da equipe.

**Faça isto uma vez:**

1. **Verificação em duas etapas** nas três contas:
   - GitHub: foto do perfil → *Settings* → *Password and authentication* → *Two-factor authentication*
   - Vercel: foto do perfil → *Settings* → *Authentication* → *Two-Factor Authentication*
   - Supabase: canto inferior esquerdo → *Account preferences* → *Security* → *Two-Factor Authentication*
   Guarde os **códigos de recuperação** que cada site mostra — são a saída se o celular sumir.

2. **Cofre de senhas** (Bitwarden é gratuito): guarde ali as senhas dessas
   três contas, a senha do login da equipe e os códigos de recuperação.
   O Bitwarden tem *Emergency access*, que dá acesso à Dra. Bruna se você
   ficar indisponível.

3. **Segundo dono nas contas**, para o projeto não depender de uma pessoa:
   - Supabase: *Organization settings* → *Team* → *Invite member* (função *Owner*)
   - Vercel: *Team Settings* → *Members* → *Invite*
   - GitHub: *Settings* do repositório → *Collaborators*

## Senha da equipe

O login é compartilhado (`clinicabrunaoliveira`). O app se tranca sozinho
depois de 30 minutos parado, avisando 1 minuto antes.

- Trocar a senha: botão **Alterar senha** no topo do app.
- Esqueceu a senha: só pelo painel da Supabase → *Authentication* → *Users*
  → os três pontinhos no usuário → *Send password recovery* ou *Reset password*.
- Sempre que alguém sair da equipe, troque a senha.

## Quando algo dá errado

| Sintoma | O que fazer |
|---|---|
| Site fora do ar | Ver vercel.com → projeto → *Deployments*: o último deve estar *Ready*. Se estiver *Error*, clicar em *Redeploy* no último que funcionou. |
| "Failed to fetch" / nada carrega | Ver supabase.com → o projeto pode estar **pausado** (plano gratuito pausa após 7 dias sem uso). Clicar em *Restore project*. |
| Alguém apagou algo sem querer | Abrir a cópia de segurança mais recente e me chamar para recolocar os dados. |
| Paciente diz que o link da ficha não abre | O link vale 7 dias e só pode ser usado uma vez. Gerar outro pelo botão **📲 Pedir ficha**. |

## Manutenção periódica

- **Toda semana:** exportar a cópia de segurança.
- **Todo mês:** conferir a aba Financeiro e baixar a planilha do mês.
- **A cada 3 meses:** pedir para atualizar as dependências do projeto
  (segurança) — é uma tarefa de meia hora.

## Monitoramento

Cadastre o site no [UptimeRobot](https://uptimerobot.com) (gratuito):
*New monitor* → tipo **HTTPS** → `https://clinica-bruna-oliveira.vercel.app`
→ intervalo de 5 minutos → e-mail de alerta. Assim você descobre que o site
caiu antes do paciente avisar.
