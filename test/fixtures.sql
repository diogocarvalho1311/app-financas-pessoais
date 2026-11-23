-- Fictional local integration fixtures. Never apply this file to production.
UPDATE accounts SET opening_balance=250000,opening_date='{{TODAY}}' WHERE id='PF';
UPDATE accounts SET opening_balance=75000,opening_date='{{TODAY}}' WHERE id='PJ';
INSERT OR IGNORE INTO fixed_expenses
  (id,description,amount,account,category,cadence,next_date,last_paid,start_month,automatic)
VALUES
  ('music','Assinatura de exemplo',1990,'PF','Compra','30days','{{NEXT_MUSIC}}','{{LAST_MUSIC}}',NULL,1),
  ('cloud','Nuvem de exemplo',990,'PF','Compra','30days','{{NEXT_CLOUD}}','{{TODAY}}',NULL,1),
  ('bill','Cobrança de exemplo',12000,'PJ','Compra','once','{{BILL_DUE}}',NULL,NULL,0),
  ('monthly','Contribuição de exemplo',10000,'PF','Dízimo','monthly',NULL,NULL,'{{PREVIOUS_MONTH}}',0);
