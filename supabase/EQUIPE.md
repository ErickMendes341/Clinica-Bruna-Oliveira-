# Logins da equipe

Cada pessoa tem o seu login e um papel. O papel decide o que ela vê no
app — e o banco impõe a mesma regra, então esconder na tela não é a
única proteção.

| Quem | Papel | O que pode |
|---|---|---|
| Dra. Bruna | `total` | tudo: agenda, pacientes, estoque, financeiro, cópia de segurança, excluir |
| Jaqueline | `total` | tudo |
| Nicole | `estoque` | agenda, pacientes, aplicar item na ficha **e** administrar o Estoque |
| Melissa | `estoque` | igual à Nicole |
| Recepção | `estoque` | igual à Nicole; login de posto, sem nome de pessoa |
| Thalita | `atendimento` | agenda, pacientes e aplicar item na ficha |
| Ludimila | `atendimento` | agenda, pacientes e aplicar item na ficha |

**Recepção é um login de posto, não de pessoa.** Quem está na recepção no
dia usa ele — a titular, ou quem estiver cobrindo férias. Por isso a senha
é definida pela administração e não muda sozinha no primeiro acesso.

Isso tem um custo que vale saber: tudo que sai desse login fica registrado
como "Recepção", sem dizer qual pessoa fez. Para agenda e cadastro não
atrapalha; se um dia precisar saber quem deu baixa em qual medicação, aí
vale criar login por pessoa.

Atenção: "Nicole" continua existindo na **agenda**, como profissional que
faz medicação e intradermoterapia capilar. Isso é outra coisa, não tem
relação com login nenhum e não muda quando alguém cobre férias.

Quem é `atendimento` não vê a aba Estoque nem a Financeiro. Consegue dar
baixa de material pela ficha do paciente (botão "Prescrever / Aplicar
item"), mas não cadastra produto, não dá entrada e não vê preço de custo
no financeiro.

## Nome nas mensagens de WhatsApp

Todas usam o mesmo número, e o WhatsApp não mostra ao paciente qual
atendente enviou. Por isso o app escreve no texto o nome de quem está logado:
"Aqui é Nicole, da Clínica Dra. Bruna Oliveira".

Assina com o nome do login (o título "Dra." é aceito). Login de posto, como a
Recepção, está marcado com `posto = true` no banco e sai com o texto neutro
"Aqui é da Clínica Dra. Bruna Oliveira".

O nome identifica quem está logado no app; o número é o do WhatsApp
conectado naquele aparelho. Num celular pessoal, a mensagem sai pelo número
pessoal.

## Cadastro pelo próprio app

É o caminho normal para pessoa nova: não precisa de ninguém no painel.

1. A pessoa abre o app e toca em **Ainda não tem acesso? Criar cadastro**.
2. Preenche o nome, o e-mail dela e uma senha. O app mostra "Aguardando
   autorização".
3. A Dra. Bruna abre o app e vê a faixa **Pedidos de acesso** no topo, em
   qualquer tela. Ela confirma com a pessoa que foi ela quem pediu, ajusta o
   nome, escolhe o tipo de acesso e toca em **Autorizar**.
4. A pessoa toca em **Verificar de novo** e entra com o e-mail e a senha dela.

O nome definido na autorização é o que aparece no app, assina as mensagens e
entra sozinho nas listas de "quem atende" e "quem aplicou".

**A conferência da Dra. Bruna é o que protege o acesso.** Conta nova não vê
dado nenhum até ser autorizada, mas o app não confere se o e-mail é mesmo da
pessoa: a opção **Confirm email** do Supabase fica desligada, porque o e-mail
padrão do Supabase só entrega para endereços da equipe do projeto. Sem ela,
alguém poderia se cadastrar usando o e-mail de outra pessoa.

Só a Dra. Bruna autoriza. Para dar o mesmo poder a outra pessoa, no **SQL
Editor** do painel:

```sql
update equipe_autorizada e
   set aprova_acessos = true
  from auth.users u
 where u.id = e.user_id and u.email = 'jaqueline@clinicabrunaoliveira.com.br';
```

Pedido recusado some da lista e a conta continua sem acesso. Para ver o que foi
recusado:

```sql
select nome, email, recusado_em
  from pedidos_acesso
 where recusado_em is not null
 order by recusado_em desc;
```

Para voltar atrás, zere a recusa e o pedido reaparece para a Dra. Bruna:

```sql
update pedidos_acesso
   set recusado_em = null
 where email = 'fulana@gmail.com';
```

## Criar o login de alguém pelo painel

Use só quando a pessoa não puder se cadastrar sozinha. A conta criada aqui
também aparece como pedido para a Dra. Bruna, e a pessoa troca a senha
provisória no primeiro acesso.

1. Acesse **supabase.com/dashboard** → projeto **Clinica Bruna Oliveira**.
2. Menu da esquerda: **Authentication** → **Users** → botão **Add user** →
   **Create new user**.
3. Preencha:
   - **Email**: `nome@clinicabrunaoliveira.com.br` (ex.: `recepcao@clinicabrunaoliveira.com.br`)
     — não precisa ser um e-mail que existe de verdade; é só o identificador.
     No app, a pessoa digita só `recepcao` que o resto é completado sozinho —
     acento e maiúscula não atrapalham, "Recepção" também entra.
   - **Password**: uma senha provisória (a pessoa troca depois no botão
     "Alterar senha" dentro do app).
   - Marque **Auto Confirm User**, senão o login fica bloqueado esperando
     confirmação por e-mail.
4. **Create user**.

> A pessoa entra com essa senha provisória e o app **obriga** a criar uma
> senha só dela antes de mostrar qualquer coisa. Depois disso, nem você
> nem ninguém mais sabe a senha dela.

## Liberar o acesso e definir o papel

Criar o login não basta: enquanto a pessoa não estiver na tabela
`equipe_autorizada`, o app mostra "Aguardando autorização". O normal é a
Dra. Bruna autorizar pelo app; o comando abaixo faz o mesmo sem passar por ela.

No painel da Supabase, vá em **SQL Editor** → **New query**, cole e execute
(troque o e-mail, o nome e o papel):

```sql
insert into equipe_autorizada (user_id, nome, papel)
select id, 'Nicole', 'estoque'
  from auth.users
 where email = 'nicole@clinicabrunaoliveira.com.br'
on conflict (user_id) do update set nome = excluded.nome, papel = excluded.papel;
```

Papéis possíveis: `atendimento`, `estoque`, `total`.

## Login de posto (recepção), que não pede senha nova

Um login de pessoa obriga a criar senha própria no primeiro acesso — o que
é certo, porque ninguém mais deve saber a senha dela. Um login de posto é
o contrário: a senha é da administração, para poder passar de mão.

Depois de criar o login no painel, rode:

```sql
insert into equipe_autorizada (user_id, nome, papel, senha_trocada_em, posto)
select id, 'Recepção', 'estoque', now(), true
  from auth.users
 where email = 'recepcao@clinicabrunaoliveira.com.br'
on conflict (user_id) do update
   set nome = excluded.nome,
       papel = excluded.papel,
       senha_trocada_em = now(),
       posto = true;
```

O `senha_trocada_em = now()` é o que dispensa a tela de trocar senha, e o
`posto = true` faz as mensagens saírem sem nome de pessoa.
Para mudar a senha depois (fim das férias, por exemplo), use o primeiro
comando da seção "Pedir que alguém troque a senha de novo".

## Mudar o papel de alguém

```sql
update equipe_autorizada e
   set papel = 'total'
  from auth.users u
 where u.id = e.user_id and u.email = 'jaqueline@clinicabrunaoliveira.com.br';
```

## Tirar o acesso de alguém que saiu

```sql
delete from equipe_autorizada e
 using auth.users u
 where u.id = e.user_id and u.email = 'fulana@clinicabrunaoliveira.com.br';
```

O login continua existindo, mas o app passa a mostrar "Aguardando
autorização". Para apagar de vez, use **Authentication → Users → … → Delete user**.

## Conferir quem tem acesso hoje

```sql
select u.email, e.nome, e.papel, e.criado_em
  from equipe_autorizada e
  join auth.users u on u.id = e.user_id
 order by e.papel, e.nome;
```

## Depois de criar os logins individuais

O login compartilhado antigo (`clinicabrunaoliveira`) deve ser removido da
`equipe_autorizada`, senão continua valendo com acesso total. Faça isso
**só depois** de confirmar que cada pessoa entrou com o login dela.

## Pedir que alguém troque a senha de novo

Ninguém consegue ver uma senha: o banco guarda só uma versão embaralhada.
Quem esqueceu recebe uma provisória nova.

O "Reset password" do painel não serve aqui: ele manda um e-mail, e estes
endereços são só identificadores. No **SQL Editor** do painel, troque a senha
e o e-mail e execute:

```sql
update auth.users
   set encrypted_password = extensions.crypt('SENHA-PROVISORIA', extensions.gen_salt('bf', 10))
 where email = 'nicole@clinicabrunaoliveira.com.br';

update equipe_autorizada e
   set senha_trocada_em = null
  from auth.users u
 where u.id = e.user_id and u.email = 'nicole@clinicabrunaoliveira.com.br';
```

Na Recepção, que é login de posto, rode só o primeiro comando: assim a senha
continua sendo a da administração.

Na próxima entrada, o app pede uma senha nova antes de liberar o acesso.
