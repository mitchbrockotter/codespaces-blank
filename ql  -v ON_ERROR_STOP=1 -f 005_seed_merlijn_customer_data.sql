                         Table "public.tenant_settings"
       Column       |           Type           | Collation | Nullable | Default 
--------------------+--------------------------+-----------+----------+---------
 tenant_id          | bigint                   |           | not null | 
 active_jar_id      | bigint                   |           |          | 
 updated_at         | timestamp with time zone |           | not null | now()
 time_saved_minutes | integer                  |           |          | 
 hourly_rate        | numeric(12,2)            |           |          | 
 login_count        | integer                  |           | not null | 0
 data_used_bytes    | bigint                   |           | not null | 0
 last_login_at      | timestamp with time zone |           |          | 
Indexes:
    "tenant_settings_pkey" PRIMARY KEY, btree (tenant_id)
Foreign-key constraints:
    "tenant_settings_active_jar_id_fkey" FOREIGN KEY (active_jar_id) REFERENCES jars(id) ON DELETE SET NULL
    "tenant_settings_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE

