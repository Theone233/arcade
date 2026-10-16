/**
 * 每日挑战的行情段池（0.5.10 起冻结）：每日挑战只在这些段里按种子抽，段库以后加了新段也不影响每日挑战抽到哪一段，
 * 同一天前后打的是同一局（排行榜才比得起来）。顺序和数量都不能改；要换段池就加一个版本（DAILY_RULES），
 * 榜单 ID 跟着加 -v<n>。冻结时和 public/data/segments/index.json 的顺序一致，所以抽到的段和 0.5.9 及以前一样。
 */
export const DAILY_SEGMENTS: readonly string[] = [
  'seg_118683445d', 'seg_bea9d7405c', 'seg_a2b822e5af', 'seg_3406225ac6', 'seg_503ea2c0d0', 'seg_1f3c87568b', 'seg_426e8efecc', 'seg_2fd2afad3f',
  'seg_62e2bca898', 'seg_435be7140d', 'seg_188db92273', 'seg_db858da5df', 'seg_dcd5b6fac7', 'seg_6dbd01d1ce', 'seg_923a3f89bd', 'seg_e34a8b4435',
  'seg_7b9d056818', 'seg_2b876ce185', 'seg_3fdb054fe1', 'seg_655883e4d0', 'seg_04025d30f3', 'seg_2dd72eb974', 'seg_758d4d2cf7', 'seg_1cb0f5baaf',
  'seg_def6def30e', 'seg_d22e61588d', 'seg_bd9c3ca090', 'seg_943fcafbba', 'seg_76141a5a68', 'seg_4613aac355', 'seg_2c1c80524e', 'seg_338a414526',
  'seg_f5aa21f612', 'seg_25e2bcb094', 'seg_8480d8e3c0', 'seg_7988d655a8', 'seg_ca2d6fd6fc', 'seg_cd44f3e18d', 'seg_309a09ba3b', 'seg_25dce90ff4',
  'seg_cd24d077cc', 'seg_dd0dee071c', 'seg_ff25469029', 'seg_babddf96a2', 'seg_634d0c2877', 'seg_3c14ae5087', 'seg_65c0bdebf8', 'seg_da57885794',
  'seg_aceb555daf', 'seg_bb3b3777b9', 'seg_440855e0fd', 'seg_3a6c9194fc', 'seg_31508e7e93', 'seg_efbf89dcec', 'seg_3307a68e6d', 'seg_95dc976491',
  'seg_1fc332bcd7', 'seg_e21e73727a', 'seg_5a19480cb6', 'seg_0bc43a9ab6', 'seg_da902cd185', 'seg_d6f48b3056', 'seg_abb12682c3', 'seg_ff5d97b294',
  'seg_0204fc7298', 'seg_a0b8ee7f27', 'seg_6a25320dc7', 'seg_e44db292e4', 'seg_e9258f8930', 'seg_f082ee99f3', 'seg_9816bf0c92', 'seg_bbb3f4be6c',
  'seg_b6b58172a8', 'seg_1eb326014c', 'seg_def0f596da', 'seg_728ace7944', 'seg_ead7e4f6f0', 'seg_b6ac8d6987', 'seg_3b37f95ee9', 'seg_dda1ec935f',
  'seg_82fced5703', 'seg_99f42d8816', 'seg_2cb161b2a6', 'seg_88275e65cc', 'seg_9a9ac9b8fd', 'seg_1f4bcac893', 'seg_4dfb09075b', 'seg_ba540ef282',
  'seg_db8500881c', 'seg_16bfe54492', 'seg_f8dc5bb25a', 'seg_b4cb115eb7', 'seg_734bdae7f9', 'seg_2b0f716902', 'seg_facc40b740', 'seg_7dae4bb657',
  'seg_70350a0c32', 'seg_f0561c354b', 'seg_81030f19e7', 'seg_80e2463761', 'seg_43f51ed12a', 'seg_23fe0a85a9', 'seg_5ea5fb7c77', 'seg_9ed5130e70',
  'seg_125fe8910e', 'seg_e4ebe7cec5', 'seg_e2fb4b5bf8', 'seg_4bede8089a', 'seg_b30d588bbe', 'seg_c5e74c681b', 'seg_8e92dc8a3d', 'seg_cce998284d',
  'seg_27b25e5358', 'seg_7b04af091b', 'seg_1210f89a3b', 'seg_97df6f0194', 'seg_d3c4ca1e0f', 'seg_f4a717fc59', 'seg_07ec320ac3', 'seg_693e78af8e',
  'seg_f7a18867cf', 'seg_7df378d46a', 'seg_73bc184761', 'seg_8d5a59581b', 'seg_7a8c3acabd', 'seg_046422299d', 'seg_f277f1ff5e', 'seg_9ca2f98ffd',
  'seg_1ba8683384', 'seg_943cfb5208', 'seg_4cc74f2b7d', 'seg_e6a3bc5e35', 'seg_38a08baeb0', 'seg_19961418f4', 'seg_6e83483077',
];
