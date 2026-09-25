# Logins da equipe

Cada pessoa tem o seu login e um papel. O papel decide o que ela vê no
app — e o banco impõe a mesma regra, então esconder na tela não é a
única proteção.

| Quem | Papel | O que pode |
|---|---|---|
| Dra. Bruna | `total` | tudo: agenda, pacientes, estoque, financeiro, cópia de segurança, excluir |
| Jaqueline | `total` | tudo |
| Recepção | `estoque` | agenda, pacientes, aplicar item na ficha **e** administrar o Estoque |
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

## Criar o login de alguém

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
`equipe_autorizada`, o app mostra "Acesso ainda não liberado".

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
insert into equipe_autorizada (user_id, nome, papel, senha_trocada_em)
select id, 'Recepção', 'estoque', now()
  from auth.users
 where email = 'recepcao@clinicabrunaoliveira.com.br'
on conflict (user_id) do update
   set nome = excluded.nome,
       papel = excluded.papel,
       senha_trocada_em = now();
```

O `senha_trocada_em = now()` é o que dispensa a tela de trocar senha.
Para mudar a senha depois (fim das férias, por exemplo), use
**Authentication → Users → … → Reset password** no painel.

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

O login continua existindo, mas o app passa a mostrar "Acesso ainda não
liberado". Para apagar de vez, use **Authentication → Users → … → Delete user**.

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

Se uma senha vazou ou a pessoa esqueceu, redefina no painel
(**Authentication → Users → … → Reset password**) e rode:

```sql
update equipe_autorizada e
   set senha_trocada_em = null
  from auth.users u
 where u.id = e.user_id and u.email = 'nicole@clinicabrunaoliveira.com.br';
```

Na próxima entrada, o app pede uma senha nova antes de liberar o acesso.
