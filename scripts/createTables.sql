DROP TABLE IF EXISTS area_info;
DROP TABLE IF EXISTS area_admin_level;
DROP TABLE IF EXISTS precinct_info;
DROP TABLE IF EXISTS senate_results;

CREATE TABLE IF NOT EXISTS area_info (
    code TEXT PRIMARY KEY,
    master_code TEXT,
    category_code INTEGER,
    name TEXT NOT NULL,
    FOREIGN KEY(master_code) REFERENCES area_info(code)
);

CREATE TABLE IF NOT EXISTS area_admin_level (
    code TEXT PRIMARY KEY,
    level INTEGER,
    FOREIGN KEY(code) REFERENCES area_info(code)
);

CREATE TABLE IF NOT EXISTS precinct_info (
    machine_id TEXT PRIMARY KEY,
    master_code TEXT NOT NULL,
    total_er_received INTEGER,
    location TEXT,
    voting_center TEXT,
    precinct_id TEXT,
    precincts_in_cluster TEXT,
    abstentions INTEGER,
    registered_voters  INTEGER NOT NULL,
    actual_voters INTEGER NOT NULL,
    valid_ballots INTEGER NOT NULL,
    FOREIGN KEY(master_code) REFERENCES area_info(code)
);

CREATE TABLE IF NOT EXISTS senate_results (
    machine_id TEXT PRIMARY KEY,
    c01_abalos INTEGER NOT NULL,
    c02_adonis INTEGER NOT NULL,
    c03_amad INTEGER NOT NULL,
    c04_andamo INTEGER NOT NULL,
    c05_aquino INTEGER NOT NULL,
    c06_arambulo INTEGER NOT NULL,
    c07_arellano INTEGER NOT NULL,
    c08_ballon INTEGER NOT NULL,
    c09_binay INTEGER NOT NULL,
    c10_bondoc INTEGER NOT NULL,
    c11_bong_revilla INTEGER NOT NULL,
    c12_bosita INTEGER NOT NULL,
    c13_brosas INTEGER NOT NULL,
    c14_cabonegro INTEGER NOT NULL,
    c15_capuyan INTEGER NOT NULL,
    c16_casiño INTEGER NOT NULL,
    c17_castro INTEGER NOT NULL,
    c18_cayetano INTEGER NOT NULL,
    c19_d_angelo INTEGER NOT NULL,
    c20_de_alban INTEGER NOT NULL,
    c21_de_guzman INTEGER NOT NULL,
    c22_dela_rosa INTEGER NOT NULL,
    c23_doringo INTEGER NOT NULL,
    c24_escobal INTEGER NOT NULL,
    c25_espiritu INTEGER NOT NULL,
    c26_floranda INTEGER NOT NULL,
    c27_gamboa INTEGER NOT NULL,
    c28_go INTEGER NOT NULL,
    c29_gonzales INTEGER NOT NULL,
    c30_hinlo INTEGER NOT NULL,
    c31_honasan INTEGER NOT NULL,
    c32_jose INTEGER NOT NULL,
    c33_lacson INTEGER NOT NULL,
    c34_lambino INTEGER NOT NULL,
    c35_lapid INTEGER NOT NULL,
    c36_lee INTEGER NOT NULL,
    c37_lidasan INTEGER NOT NULL,
    c38_marcoleta INTEGER NOT NULL,
    c39_marcos INTEGER NOT NULL,
    c40_marquez INTEGER NOT NULL,
    c41_martinez INTEGER NOT NULL,
    c42_mata INTEGER NOT NULL,
    c43_matula INTEGER NOT NULL,
    c44_maza INTEGER NOT NULL,
    c45_mendoza INTEGER NOT NULL,
    c46_montemayor INTEGER NOT NULL,
    c47_mustapha INTEGER NOT NULL,
    c48_olivar INTEGER NOT NULL,
    c49_ong INTEGER NOT NULL,
    c50_pacquiao INTEGER NOT NULL,
    c51_pangilinan INTEGER NOT NULL,
    c52_querubin INTEGER NOT NULL,
    c53_quiboloy INTEGER NOT NULL,
    c54_ramos INTEGER NOT NULL,
    c55_revillame INTEGER NOT NULL,
    c56_rodriguez INTEGER NOT NULL,
    c57_sahidulla INTEGER NOT NULL,
    c58_salvador INTEGER NOT NULL,
    c59_sotto INTEGER NOT NULL,
    c60_tapado INTEGER NOT NULL,
    c61_tolentino INTEGER NOT NULL,
    c62_tulfo INTEGER NOT NULL,
    c63_tulfo INTEGER NOT NULL,
    c64_valbuena INTEGER NOT NULL,
    c65_verceles INTEGER NOT NULL,
    c66_villar INTEGER NOT NULL,
    FOREIGN KEY(machine_id) REFERENCES precinct_info(machine_id)
);