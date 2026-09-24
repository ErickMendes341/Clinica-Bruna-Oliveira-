# Logins da equipe

Cada pessoa tem o seu login e um papel. O papel decide o que ela vê no
app — e o banco impõe a mesma regra, então esconder na tela não é a
única proteção.

| Quem | Papel | O que pode |
|---|---|---|
| Dra. Bruna | `total` | tudo: agenda, pacientes, estoque, financeiro, cópia de segurança, excluir |
| Jaqueline | `total` | tudo |
| Nicole | `estoque` | agenda, pacientes, aplicar item na ficha **e** administrar o Estoque |
| Thalita | `atendimento` | agenda, pacientes e aplicar item na ficha |
| Ludimila | `atendimento` | agenda, pacientes e aplicar item na ficha |

Quem é `atendimento` não vê a aba Estoque nem a Financeiro. Consegue dar
baixa de material pela ficha do paciente (botão "Prescrever / Aplicar
item"), mas não cadastra produto, não dá entrada e não vê preço de custo
no financeiro.

## Criar o login de alguém

1. Acesse **supabase.com/dashboard** → projeto **Clinica Bruna Oliveira**.
2. Menu da esquerda: **Authentication** → **Users** → botão **Add user** →
   **Create new user**.
3. Preencha:
   - **Email**: `nome@clinicabrunaoliveira.com.br` (ex.: `nicole@clinicabrunaoliveira.com.br`)
     — não precisa ser um e-mail que existe de verdade; é só o identificador.
     No app, a pessoa digita só `nicole` que o resto é completado sozinho.
   - **Password**: uma senha provisória (a pessoa troca depois no botão
     "Alterar senha" dentro do app).
   - Marque **Auto Confirm User**, senão o login fica bloqueado esperando
     confirmação por e-mail.
4. **Create user**.

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
