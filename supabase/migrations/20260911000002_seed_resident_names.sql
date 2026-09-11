-- Source: SLN Urbana owners sheets supplied on 11-09-2026.
-- Keep existing flat IDs intact so collection history remains linked correctly.
with target_numbers(flat_number, sequence) as (
  select (100 + unit)::text, row_number() over (order by unit)
  from generate_series(1,14) unit where unit <> 12
  union all
  select (floor_number * 100 + unit)::text,
         13 + ((floor_number - 2) * 18) + unit
  from generate_series(2,6) floor_number cross join generate_series(1,18) unit
), existing_flats as (
  select id, row_number() over (order by nullif(regexp_replace(flat_number, '[^0-9]', '', 'g'), '')::integer, id) as sequence
  from public.flats
)
update public.flats f set flat_number = t.flat_number
from existing_flats e join target_numbers t using (sequence)
where f.id = e.id;

update public.flats f
set resident_name = source.resident_name
from (values
  ('101', 'Kavya Reddy'), ('102', 'S. Naveena Reddy'), ('103', 'Anirudh T. M.'),
  ('104', 'Dr. Sashikanth T.'), ('105', 'P. Sireesha Rahul Rao'), ('106', 'I. Nagalaxmi'),
  ('107', 'Revanth Reddy Arra'), ('108', 'K. Laxma Reddy'), ('109', 'J. Muralidhar'),
  ('110', 'M. Janaki Devi'), ('111', 'K. Kavitha Gopalareddy'), ('113', 'Jayanth Reddy Katpally'),
  ('114', 'Madhavi C. H.'),
  ('201', 'N. Praveen Kumar'), ('202', 'Alok I. Chandekar'), ('203', 'A. Ritesh Reddy'),
  ('204', 'Mahesh'), ('205', 'Ramakrishna Jammi'), ('206', 'A. R. C. John Robert'),
  ('207', 'Kartik Godavarthi'), ('208', 'Manmeet Singh'), ('209', 'P. Lalitha'),
  ('210', 'L. Vijaybhasker Reddy'), ('211', 'Sneha Reddy'), ('212', 'B. Venkat Reddy'),
  ('213', 'Vinod Kumar C.'), ('214', 'Ch. Nagaraju'), ('215', 'S. Rajeshwar'),
  ('216', 'Srinivas R.'), ('217', 'K. V. S. S. L. V. Prasada Rao'), ('218', 'Mahasudan'),
  ('301', 'Kranti Kumar'), ('302', 'Manohar Rao N.'), ('303', 'Dhana Raju'),
  ('304', 'Ashish Kanasaria'), ('305', 'Roja Dattu Prakash'), ('306', 'Milind G.'),
  ('307', 'Ch. Vikram Reddy'), ('308', 'Rajesh Tripathy'), ('309', 'Kapil Reddy'),
  ('310', 'Rajani Reddy'), ('311', 'Ratna'), ('312', 'D. Srinivas'),
  ('313', 'Sama Sreedhar'), ('314', 'Ramesh K.'), ('315', 'Narasimha Murthy'),
  ('316', 'Lalitha'), ('317', 'Prema Rajaram'), ('318', 'Raghunadh'),
  ('401', 'Sridhar Reddy'), ('402', 'Keerthi Reddy'), ('403', 'Varun'),
  ('404', 'Dayakar Sarigamala'), ('405', 'Parandharamalah B.'), ('406', 'P. Bhaskar Rao'),
  ('407', 'B. V. R. Lalith'), ('408', 'M. Rajender Reddy'), ('409', 'M. Rajendra Prasad Goud'),
  ('410', 'Gaddam Sudheer Kumar Reddy'), ('411', 'Murthy'), ('412', 'J. V. Ramana Reddy'),
  ('413', 'Nikhil'), ('414', 'Kamalakar Reddy'), ('415', 'Deepthi Pramod Reddy'),
  ('416', 'Shravan Mukund'), ('417', 'P. Deepak Mohan'), ('418', 'Abhinay Karthik'),
  ('501', 'P. Jalaja'), ('502', 'Shailaja'), ('503', 'A. Vijaya Laxmi'),
  ('504', 'Amul Kumar'), ('505', 'V. Venkata Ramana'), ('506', 'Chandrasekhar'),
  ('507', 'A. Ramgopal'), ('508', 'Mallika Reddy'), ('509', 'G. Chiranjeevikumar'),
  ('510', 'Lakpathi Reddy'), ('511', 'K. V. R. Murthy'), ('512', 'M. Navaneeth Reddy'),
  ('513', 'Mithun'), ('514', 'Ajay Kumar Singh'), ('515', 'Prerna'),
  ('516', 'Santosh Reddy'), ('517', 'Jaya Prakash'), ('518', 'Omkaar'),
  ('601', 'Surender Rao M.'), ('602', 'Raneesh Reddy'), ('603', 'Vijayalakshmi Ch.'),
  ('604', 'T. Srikar'), ('605', 'Preetam Reddy'), ('606', 'Vamsi'),
  ('607', 'Moguloori Vara Lakshmi'), ('608', 'Karunakaran M.'), ('609', 'Shiva Reddy C.'),
  ('610', 'P. Prashanth'), ('611', 'Ponugoti Ramapathirao'), ('612', 'D. C. Reddy'),
  ('613', 'Arjun Raju'), ('614', 'Satya Narayana Prasad Akula'), ('615', 'Reena'),
  ('616', 'Kavitha Reddy'), ('617', 'Rizwaa Begum'), ('618', 'Praveen Kearle')
) as source(flat_number, resident_name)
where f.flat_number = source.flat_number;
